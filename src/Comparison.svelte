<script lang="ts">
import { untrack } from 'svelte';
import { highlightDiff } from './lib/diff.ts';
import { attachGadget } from './lib/gadget.ts';
import type { Card, Rendering, Subject } from './lib/subject.ts';
import { WIKI } from './lib/wiki.ts';

interface Props {
  subject: Subject;
  /** the old and the new side; null while loading */
  sides: [Rendering | null, Rendering | null];
  highlight: boolean;
}
let { subject, sides, highlight }: Props = $props();

// The cards are wiki HTML that the gadget and the diff edit in place, so they are mounted by hand rather than
// rendered by Svelte; this tracks the mounted elements per side and slot.
const mounted: [(HTMLElement | undefined)[], (HTMLElement | undefined)[]] = [[], []];

const diffSlot = (slot: number) => {
  highlightDiff(mounted[0][slot], mounted[1][slot], highlight);
};

$effect(() => {
  for (let slot = 0; slot < subject.slots; slot++) diffSlot(slot);
});

const mount = (side: 0 | 1, slot: number, card: Card | null | undefined) => (host: HTMLElement) => {
  host.innerHTML = card?.html ?? '';
  const el = host.firstElementChild instanceof HTMLElement ? host.firstElementChild : undefined;
  mounted[side][slot] = el;
  if (!el) return;
  host.querySelectorAll('a[href^="/"]').forEach((a) => {
    a.setAttribute('href', WIKI + (a.getAttribute('href') ?? ''));
  });
  if (card?.ability) {
    attachGadget(el, card.ability, () => {
      diffSlot(slot);
    });
  }
  // untracked: a highlight toggle must not remount the cards, which would reset their upgrade selection
  untrack(() => {
    diffSlot(slot);
  });
};

const title = (slot: number) =>
  slot === 0
    ? (subject.kind === 'item' ? 'Item card' : 'Hero card')
    : sides[1]
    ? (sides[1].cards[slot]?.title ?? '')
    : `Ability ${slot}`;
</script>

{#each { length: subject.slots }, slot}
  <section>
  <h2>{title(slot)}</h2>
  <div class="pair">
    <div class="side mw-parser-output" {@attach mount(0, slot, sides[0]?.cards[slot])}></div>
    <div class="side mw-parser-output" {@attach mount(1, slot, sides[1]?.cards[slot])}></div>
  </div>
</section>
{/each}

<style>
h2 {
  font-size: 1rem;
  margin: 22px 0 6px;
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 1080px) {
  .pair {
    grid-template-columns: 1fr;
  }
}
/* the wiki's card CSS is scoped to .mw-parser-output; the colour/font pin keeps cards identical to the wiki */
.side {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-width: 0;
  color: var(--text);
  font-family: Inter, sans-serif;
  --link-color: #60f8b3;
}
.side :global(a) {
  color: var(--link-color);
}
/* The wiki masks this backdrop with a torn-paper PNG. CSS masks are fetched in CORS mode and cdn.deadlock.wiki only
   allows its own origin, so the mask is blocked here and the unmasked backdrop would show as a stray shape. */
.side :global(.infobox-h-title-hero-tornbox) {
  display: none;
}
/* Item cards are masked with that same kind of blocked image. Firefox treats a mask that fails to load as fully
   transparent and hides the whole card (Chrome ignores it), so the mask is dropped and the card keeps square edges. */
.side :global(.infobox_item .infobox-table) {
  mask-image: none;
}
.side :global(.diff-del) {
  background: rgba(255, 70, 70, 0.35);
  border-radius: 2px;
}
.side :global(.diff-add) {
  background: rgba(60, 220, 110, 0.3);
  border-radius: 2px;
}
</style>
