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

async function api<T>(params: Record<string, string | number>, post: boolean, signal?: AbortSignal): Promise<T> {
  const p = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*' });
  for (const [k, v] of Object.entries(params)) p.set(k, String(v));
  const r =
    await (post
      ? fetch(API, { method: 'POST', body: p, signal: signal ?? null })
      : fetch(`${API}?${p.toString()}`, { signal: signal ?? null }));
  if (!r.ok) throw new Error(`wiki API ${r.status}`);
  const j = (await r.json()) as T & { error?: { info: string } };
  if (j.error) throw new Error(j.error.info);
  return j;
}

/**
 * Caches a promise per key, and forgets failed ones so they can be retried. Callers share the work, so it is only
 * aborted (and forgotten) once every caller waiting on it has aborted; a caller without a signal keeps it alive.
 */
export function memo<K, V>(
  fn: (key: K, signal: AbortSignal) => Promise<V>,
): (key: K, signal?: AbortSignal) => Promise<V> {
  interface Job {
    promise: Promise<V>;
    abort: AbortController;
    waiters: number;
    settled: boolean;
  }
  const cache = new Map<K, Job>();
  const forget = (key: K, job: Job) => {
    if (cache.get(key) === job) cache.delete(key);
  };
  return (key, signal) => {
    if (signal?.aborted === true) return Promise.reject(signal.reason as Error);
    let job = cache.get(key);
    if (!job) {
      const abort = new AbortController();
      const j: Job = { promise: fn(key, abort.signal), abort, waiters: 0, settled: false };
      j.promise.then(
        () => {
          j.settled = true;
        },
        () => {
          j.settled = true;
          forget(key, j);
        },
      );
      cache.set(key, j);
      job = j;
    }
    if (!signal) {
      job.waiters = Infinity;
      return job.promise;
    }
    const j = job;
    j.waiters++;
    return new Promise<V>((resolve, reject) => {
      const onAbort = () => {
        reject(signal.reason as Error);
        if (--j.waiters === 0 && !j.settled) {
          j.abort.abort(signal.reason);
          forget(key, j);
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
      j.promise.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    });
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
    }, false);
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
export async function wikitext(title: string, signal?: AbortSignal): Promise<string> {
  return contentOf(
    await api<QueryResponse>(
      {
        action: 'query',
        prop: 'revisions',
        rvslots: 'main',
        rvprop: 'content',
        titles: title,
        redirects: 1,
      },
      false,
      signal,
    ),
  );
}

/**
 * A JSON data page at one revision (number) or its current one (title); shared by all heroes and items.
 * Read it through the typed accessors in data.ts.
 */
export const pageJson = memo(async (page: string | number, signal): Promise<unknown> => {
  const j = await api<QueryResponse>(
    {
      action: 'query',
      prop: 'revisions',
      rvslots: 'main',
      rvprop: 'content',
      ...(typeof page === 'number' ? { revids: page } : { titles: page }),
    },
    false,
    signal,
  );
  return JSON.parse(contentOf(j));
});

/**
 * Drops every mask declaration. Masks are fetched in CORS mode, and cdn.deadlock.wiki only allows its own origin, so
 * they always fail here; Firefox then hides the whole masked element, so unmasked (square) is the best we can show.
 * Quoted values are skipped whole, since data: URIs contain semicolons.
 */
export const stripMasks = (css: string): string =>
  css.replace(/(?<=[{;\s])(?:-webkit-)?mask(?:-[a-z-]+)?\s*:(?:"[^"]*"|'[^']*'|[^;}"'])*;?/g, '');

if (import.meta.env.DEV) {
  const out = stripMasks(
    `.a{color:red;mask-image:url("data:a;b");-webkit-mask:url(x) no-repeat}.b{--mask-x:1;mask-size:1px;top:0}` +
      `@supports (mask-image:none){.c{mask:none}}`,
  );
  if (out !== `.a{color:red;}.b{--mask-x:1;top:0}@supports (mask-image:none){.c{}}`) {
    throw new Error(`stripMasks self-check failed: ${out}`);
  }
}

/** The translations `keep` accepts, ready to swap in for Data:Lang. */
export const sandboxTexts = (texts: Record<string, string>, keep: (key: string) => boolean): Record<string, string> =>
  Object.fromEntries(
    Object.entries(texts).filter(([k]) => keep(k))
      // the card modules cut text at a template's `|`
      .map(([k, v]) => [k, v.replace(/\{\{[^{}]*\}\}/g, (t) => t.replaceAll('|', '{{!}}'))]),
  );

export interface Sandbox {
  page: string;
  content: unknown;
}

/**
 * Renders wikitext with the wiki's own templates. `sandbox` swaps one page's content for this render only
 * (TemplateSandbox), which is how old data revisions get rendered with the current templates.
 */
export async function parse(
  text: string,
  title: string,
  sandbox?: Sandbox,
  signal?: AbortSignal,
): Promise<{ css: string; doc: Document }> {
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
    signal,
  );
  if (j.parse.text.includes('Lua error')) throw new Error('render failed');
  const doc = new DOMParser().parseFromString(j.parse.text, 'text/html');
  const styles = [...doc.querySelectorAll('style')];
  const css = stripMasks(styles.map((s) => s.textContent).join('\n'));
  for (const s of styles) s.remove();
  return { css, doc };
}
