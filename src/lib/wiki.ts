// Thin client for the deadlock.wiki MediaWiki API: page history, page contents, and server-side rendering.

export const WIKI = 'https://deadlock.wiki';
const API = `${WIKI}/api.php`;

export const PAGES = {
  abilities: 'Data:AbilityCards.json',
  heroData: 'Data:HeroData.json',
  lang: 'Data:Lang en.json',
  items: 'Data:ItemCards.json',
  // the flat item file that Data:ItemCards.json replaced on 2026-03-02
  legacyItems: 'Data:ItemData.json',
} as const;

export interface Revision {
  revid: number;
  timestamp: string;
  comment: string;
  user: string;
  /** a Data:ItemData.json revision, converted on render */
  legacy?: boolean;
}

interface QueryResponse {
  query: {
    pages: {
      revisions?: {
        revid: number;
        timestamp: string;
        // hidden by the wiki on suppressed revisions
        comment?: string;
        user?: string;
        slots?: { main: { content: string } };
      }[];
    }[];
  };
  continue?: Record<string, string>;
}

interface ParseResponse {
  parse: { text: string };
}

export const errorMessage = (e: unknown): string => e instanceof Error ? e.message : String(e);

async function api<T>(params: Record<string, string | number>, post = false): Promise<T> {
  const p = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*' });
  for (const [k, v] of Object.entries(params)) p.set(k, String(v));
  const r = await (post ? fetch(API, { method: 'POST', body: p }) : fetch(`${API}?${p.toString()}`));
  if (!r.ok) throw new Error(`wiki API ${r.status}`);
  const j = (await r.json()) as T & { error?: { info: string } };
  if (j.error) throw new Error(j.error.info);
  return j;
}

/** Caches a promise per key, and forgets failed ones so they can be retried. */
export function memo<K, V>(fn: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const cache = new Map<K, Promise<V>>();
  return (key) => {
    let p = cache.get(key);
    if (!p) {
      p = fn(key);
      cache.set(key, p);
      p.catch(() => {
        cache.delete(key);
      });
    }
    return p;
  };
}

/**
 * Every Deadbot game-patch revision of a data page, oldest first. Re-queried on each page load so new patches
 * appear on their own; other edits are not game patches.
 */
export async function listPatches(title: string): Promise<Revision[]> {
  const out: Revision[] = [];
  let cont: Record<string, string> | undefined = {};
  while (cont) {
    const j: QueryResponse = await api<QueryResponse>({
      action: 'query',
      prop: 'revisions',
      rvprop: 'ids|timestamp|comment|user',
      rvlimit: 500,
      rvdir: 'newer',
      titles: title,
      ...cont,
    });
    for (const r of j.query.pages[0]?.revisions ?? []) {
      out.push({ revid: r.revid, timestamp: r.timestamp, comment: r.comment ?? '', user: r.user ?? '' });
    }
    cont = j.continue;
  }
  return out.filter((r) => r.user === 'Deadbot' && /^deadbot v/i.test(r.comment));
}

/**
 * Deadbot saves each data page in the same patch run with the same comment label, a few minutes apart.
 * Pages without a revision for a patch were unchanged, so the closest earlier revision applies.
 */
export function matchRevision(list: Revision[], patch: Revision): Revision | undefined {
  return list.find((r) => r.comment === patch.comment) ??
    list.filter((r) => Date.parse(r.timestamp) <= Date.parse(patch.timestamp) + 3600e3).at(-1);
}

const contentOf = (j: QueryResponse): string => j.query.pages[0]?.revisions?.[0]?.slots?.main.content ?? '';

/** Raw wikitext of a page's current revision ('' when missing); redirects are followed. */
export async function wikitext(title: string): Promise<string> {
  return contentOf(
    await api<QueryResponse>({
      action: 'query',
      prop: 'revisions',
      rvslots: 'main',
      rvprop: 'content',
      titles: title,
      redirects: 1,
    }),
  );
}

/**
 * A JSON data page at one revision (number) or its current one (title); shared by all heroes and items.
 * Read it through the typed accessors in data.ts.
 */
export const pageJson = memo(async (page: string | number): Promise<unknown> => {
  const j = await api<QueryResponse>({
    action: 'query',
    prop: 'revisions',
    rvslots: 'main',
    rvprop: 'content',
    ...(typeof page === 'number' ? { revids: page } : { titles: page }),
  });
  return JSON.parse(contentOf(j));
});

export interface Sandbox {
  page: string;
  content: unknown;
}

/**
 * Renders wikitext with the wiki's own templates. `sandbox` swaps one page's content for this render only
 * (TemplateSandbox), which is how old data revisions get rendered with the current templates.
 */
export async function parse(text: string, title: string, sandbox?: Sandbox): Promise<{ css: string; doc: Document }> {
  const sb: Record<string, string> = sandbox
    ? {
      templatesandboxtitle: sandbox.page,
      templatesandboxtext: JSON.stringify(sandbox.content),
      templatesandboxcontentmodel: 'json',
      templatesandboxcontentformat: 'application/json',
    }
    : {};
  const j = await api<ParseResponse>(
    { action: 'parse', prop: 'text', contentmodel: 'wikitext', title, text, ...sb },
    true,
  );
  if (j.parse.text.includes('Lua error')) throw new Error('render failed');
  const doc = new DOMParser().parseFromString(j.parse.text, 'text/html');
  const styles = [...doc.querySelectorAll('style')];
  const css = styles.map((s) => s.textContent).join('\n');
  for (const s of styles) s.remove();
  return { css, doc };
}
