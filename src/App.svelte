<script lang="ts">
import Comparison from './Comparison.svelte';
import Picker from './Picker.svelte';
import { heroKind } from './lib/hero.ts';
import { itemKind } from './lib/item.ts';
import { heroNavbox, itemNavbox, type Navbox } from './lib/navbox.ts';
import { type Entry, type Kind, lastOf, type Rendering, type Subject } from './lib/subject.ts';
import { errorMessage, type Revision } from './lib/wiki.ts';

type Pick = Entry & { kind: Subject['kind'] };

let kinds: { hero: Kind; item: Kind | null } | null = null;
let navboxes = $state.raw<{ hero: Navbox; item: Navbox | null } | null>(null);

let status = $state({ text: 'Loading revision list…', error: false });
const setStatus = (text: string, error = false) => {
  status = { text, error };
};

/** what the user picked; `subject` follows once its history has loaded */
let picked = $state.raw<Pick | null>(null);
let subject = $state.raw<Subject | null>(null);
/** the revisions shown on the old and the new side */
let revids = $state<[number, number]>([0, 0]);
let sides = $state.raw<[Rendering | null, Rendering | null]>([null, null]);
// the URL hash is `#key`, optionally followed by `?old=<revid>&new=<revid>&hl=1`,
// so reloads and shared links restore the view
const [hashKey = '', hashQuery = ''] = location.hash.slice(1).split('?');
const hashParams = new URLSearchParams(hashQuery);
let highlight = $state(hashParams.get('hl') === '1');
/** revisions from the hash, applied to the first pick only: revids mean nothing for any other hero or item */
let wanted: { old: number; new: number } | null = {
  old: Number(hashParams.get('old')),
  new: Number(hashParams.get('new')),
};
/** the cards' TemplateStyles; identical across revisions */
let cardCss = $state('');

const thumb = $derived(picked && navboxes?.[picked.kind]?.thumbs.get(picked.key));

// The wiki's CSS goes in through textContent, so nothing in it can close the <style> tag and inject markup.
const wikiStyle = document.head.appendChild(document.createElement('style'));
$effect(() => {
  wikiStyle.textContent = [navboxes?.hero.css, navboxes?.item?.css, cardCss].join('\n');
});

/** cancels the previous pick's loading, so switching around doesn't queue up requests to the wiki */
let pickAbort = new AbortController();
async function pick(p: Pick, kind: Kind) {
  pickAbort.abort();
  const hashed = wanted;
  wanted = null;
  const { signal } = (pickAbort = new AbortController());
  picked = p;
  subject = null;
  sides = [null, null];
  history.replaceState(null, '', '#' + p.key);
  setStatus(`Loading ${p.name}…`);
  try {
    const s = await kind.open(p, signal);
    if (signal.aborted) return; // another pick was made meanwhile
    // earlier revisions than the release are pre-release data
    // revids grow with time, so the numerically closest revision is the closest in time
    // a missing or garbled hash revid is NaN or 0, which falls back
    const closest = (revid: number | undefined, fallback: number) =>
      revid !== undefined && revid > 0
        ? s.revisions.reduce((a, b) => Math.abs(b.revid - revid) < Math.abs(a.revid - revid) ? b : a).revid
        : fallback;
    revids = [
      closest(hashed?.old, (s.release ?? s.revisions[0]).revid),
      closest(hashed?.new, lastOf(s.revisions).revid),
    ];
    subject = s;
  } catch (e) {
    if (!signal.aborted) setStatus(`Failed to load ${p.name}: ${errorMessage(e)}`, true);
  }
}

// revids are 0 until the subject has loaded, which must not overwrite the hash
$effect(() => {
  if (!picked || !subject) return;
  const params = new URLSearchParams({
    old: String(revids[0]),
    new: String(revids[1]),
    ...(highlight ? { hl: '1' } : {}),
  });
  history.replaceState(null, '', `#${picked.key}?${params}`);
});

/** Picks the hero or item with `key`; false when there is none. */
function pickKey(key: string): boolean {
  for (const kindName of ['hero', 'item'] as const) {
    const kind = kinds?.[kindName];
    const entry = kind?.entries.find((e) => e.key === key);
    if (kind && entry) {
      void pick({ ...entry, kind: kindName }, kind);
      return true;
    }
  }
  return false;
}

// each side renders its revision; a newer selection cancels an older one still loading
for (const side of [0, 1] as const) {
  let rendered: Subject | null = null;
  $effect(() => {
    const s = subject, revid = revids[side];
    if (!s) return;
    const abort = new AbortController();
    setStatus(`Loading r${revid}…`);
    // arrowing through a select changes the revision on every step, so a revision change waits to see if it stays
    const delay = s === rendered ? 250 : 0;
    rendered = s;
    const timer = setTimeout(() => {
      s.render(revid, abort.signal).then(
        (r) => {
          if (abort.signal.aborted) return;
          cardCss = r.css;
          sides = side === 0 ? [r, sides[1]] : [sides[0], r];
          setStatus('');
        },
        (e: unknown) => {
          if (!abort.signal.aborted) setStatus(`Failed to load r${revid}: ${errorMessage(e)}`, true);
        },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  });
}

const label = (r: Revision) =>
  `${r.timestamp.slice(0, 10)} · ${r.comment.replace(/^deadbot /i, '')} · r${r.revid}${
    r === subject?.release ? ' · ★ release' : ''
  }`;

void (async () => {
  try {
    const [hero, item] = await Promise.all([
      heroKind(),
      itemKind().catch((e: unknown) => {
        console.warn('items unavailable, comparing heroes only', e);
        return null;
      }),
    ]);
    kinds = { hero, item };
    // picked before the navboxes load: they only feed the picker and thumbnail, and take seconds to render
    // the URL hash keeps the pick across reloads
    if (!pickKey(hashKey)) {
      wanted = null; // the revisions belonged to a pick that doesn't exist
      if (hero.entries[0]) pickKey(hero.entries[0].key);
    }
    try {
      const [heroNav, itemNav] = await Promise.all([
        heroNavbox(hero.entries),
        item && item.entries.length > 0 ? itemNavbox(item.entries) : null,
      ]);
      navboxes = { hero: heroNav, item: itemNav };
    } catch (e) {
      setStatus(`Failed to load the hero and item picker: ${errorMessage(e)}`, true);
    }
  } catch (e) {
    setStatus(`Failed to load revision list: ${errorMessage(e)}`, true);
  }
})();
</script>

<svelte:head>
  <title>{picked ? `${picked.name} ${picked.kind === 'item' ? 'item' : 'ability'} comparison` : 'Deadlock ability comparison'}</title>
</svelte:head>

<header>
  <div class="bar">
    <div class="pick">
      <div class="thumb mw-parser-output" class:hero={picked?.kind === 'hero'}>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- the navbox HTML is the wiki's own render, like the cards -->
        {#if thumb}{@html thumb}{:else}{picked?.name}{/if}
      </div>
      <Picker {navboxes} current={picked} onpick={pickKey} />
    </div>
    <label>
      Old
      <select bind:value={revids[0]}>
        {#each subject?.revisions ?? [] as r (r.revid)}<option value={r.revid}>{label(r)}</option>{/each}
      </select>
    </label>
    <button type="button" title="Swap sides" onclick={() => (revids = [revids[1], revids[0]])}>⇄</button>
    <label>
      New
      <select bind:value={revids[1]}>
        {#each subject?.revisions ?? [] as r (r.revid)}<option value={r.revid}>{label(r)}</option>{/each}
      </select>
    </label>
    <label
      class="check"><span>&nbsp;</span><span><input type="checkbox" bind:checked={highlight} /> Highlight differences</span></label>
  </div>
  <div class="status" class:err={status.error}>{status.text}</div>
</header>

<main>
  {#if subject}<Comparison {subject} {sides} {highlight} />{/if}
</main>

<style>
header {
  position: sticky;
  top: 0;
  z-index: 10;
  /* opaque: it hides the body's separator line */
  background: var(--page);
  border-bottom: 1px solid #2a2a2a;
  padding: 10px 16px;
}
.bar {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
  max-width: 1100px;
  margin: 0 auto;
}
.pick {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: auto;
}
.thumb.hero {
  min-height: 105px;
}
/* the revision labels are long, so the selects shrink (ellipsis) and wrap instead of widening the page */
label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.75rem;
  color: #aaa;
  flex: 1 1 240px;
  min-width: 0;
}
label.check {
  flex: 0 0 auto;
  cursor: pointer;
  font-size: 0.85rem;
  color: inherit;
}
select {
  width: 100%;
  min-width: 0;
  text-overflow: ellipsis;
}
select,
button {
  background: #232323;
  color: inherit;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  padding: 6px 8px;
  font: inherit;
}
button {
  cursor: pointer;
}
.status {
  max-width: 1100px;
  margin: 4px auto 0;
  font-size: 0.8rem;
  color: #aaa;
  min-height: 1.2em;
}
.status.err {
  color: #ff8a8a;
}
main {
  position: relative;
  flex: 1 0 auto;
  box-sizing: border-box;
  width: 100%;
  max-width: 1132px;
  /* never narrower than the two card columns side by side: the page scrolls sideways instead */
  min-width: min-content;
  margin: 0 auto;
  padding: 8px 16px 40px;
}
/* separates old from new; the columns are equal and the padding symmetric, so 50% is the middle of their gap */
main::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 50%;
  border-left: 1px solid #4a3b2e;
}
</style>
