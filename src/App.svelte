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
let pickerOpen = $state(false);

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
let highlight = $state(false);
/** the cards' TemplateStyles; identical across revisions */
let cardCss = $state('');

const thumb = $derived(picked && navboxes?.[picked.kind]?.thumbs.get(picked.key));

// The wiki's CSS goes in through textContent, so nothing in it can close the <style> tag and inject markup.
const wikiStyle = document.head.appendChild(document.createElement('style'));
$effect(() => {
  wikiStyle.textContent = [navboxes?.hero.css, navboxes?.item?.css, cardCss].join('\n');
});

let pickCount = 0;
async function pick(p: Pick, kind: Kind) {
  const pickId = ++pickCount;
  picked = p;
  subject = null;
  sides = [null, null];
  history.replaceState(null, '', '#' + p.key);
  setStatus(`Loading ${p.name}…`);
  try {
    const s = await kind.open(p);
    if (pickId !== pickCount) return; // another pick was made meanwhile
    // earlier revisions than the release are pre-release data
    revids = [(s.release ?? s.revisions[0]).revid, lastOf(s.revisions).revid];
    subject = s;
  } catch (e) {
    setStatus(`Failed to load ${p.name}: ${errorMessage(e)}`, true);
  }
}

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

// each side renders its revision; a newer selection discards an older one still loading
for (const side of [0, 1] as const) {
  $effect(() => {
    const s = subject, revid = revids[side];
    if (!s) return;
    let stale = false;
    setStatus(`Loading r${revid}…`);
    s.render(revid).then(
      (r) => {
        if (stale) return;
        cardCss = r.css;
        sides = side === 0 ? [r, sides[1]] : [sides[0], r];
        setStatus('');
      },
      (e: unknown) => {
        if (!stale) setStatus(`Failed to load r${revid}: ${errorMessage(e)}`, true);
      },
    );
    return () => {
      stale = true;
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
    const [heroNav, itemNav] = await Promise.all([
      heroNavbox(hero.entries),
      item && item.entries.length > 0 ? itemNavbox(item.entries) : null,
    ]);
    navboxes = { hero: heroNav, item: itemNav };
    // the URL hash keeps the pick across reloads
    if (!pickKey(location.hash.slice(1)) && hero.entries[0]) pickKey(hero.entries[0].key);
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
      <button type="button" onclick={() => (pickerOpen = true)}>Select</button>
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

{#if navboxes}
  <Picker bind:open={pickerOpen} heroes={navboxes.hero} items={navboxes.item} current={picked} onpick={pickKey} />
{/if}

<style>
header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #141414ee;
  backdrop-filter: blur(6px);
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
  max-width: 1100px;
  margin: 0 auto;
  padding: 8px 16px 40px;
}
</style>
