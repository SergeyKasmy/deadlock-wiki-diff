<script lang="ts">
import type { Navbox } from './lib/navbox.ts';

interface Props {
  heroes: Navbox;
  items: Navbox | null;
  /** the current pick; the dialog opens on its tab */
  current: { key: string; kind: 'hero' | 'item' } | null;
  open?: boolean;
  onpick: (key: string) => void;
}
let { heroes, items, current, open = $bindable(false), onpick }: Props = $props();

let dialog = $state<HTMLDialogElement>();
let tab = $state<'heroes' | 'items'>('heroes');

$effect(() => {
  if (!dialog || open === dialog.open) return;
  if (open) {
    tab = current?.kind === 'item' && items ? 'items' : 'heroes';
    dialog.showModal();
  } else dialog.close();
});

// the grid is wiki HTML, so the current pick is marked on it directly
const grid = (html: string) => (el: HTMLElement) => {
  el.innerHTML = html;
  if (current) el.querySelector(`[data-pick="${CSS.escape(current.key)}"]`)?.classList.add('current');
};

function click(e: MouseEvent) {
  if (e.target === dialog) {
    open = false; // backdrop click
    return;
  }
  const key = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-pick]')?.dataset['pick'] : undefined;
  if (key === undefined) return;
  open = false;
  onpick(key);
}
</script>

<!-- onclose: Escape closes the dialog without going through `open` -->
<dialog bind:this={dialog} onclick={click} onclose={() => (open = false)}>
  {#if items}
    <div class="tabs">
      <button type="button" class:active={tab === 'heroes'} onclick={() => (tab = 'heroes')}>Heroes</button>
      <button type="button" class:active={tab === 'items'} onclick={() => (tab = 'items')}>Items</button>
    </div>
  {/if}
  <div class="mw-parser-output" {@attach grid(tab === 'items' && items ? items.html : heroes.html)}></div>
</dialog>

<style>
dialog {
  background: #1b1b1b;
  color: inherit;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  padding: 12px;
  max-width: min(1100px, 94vw);
  max-height: 90vh;
  overflow: auto;
}
dialog::backdrop {
  background: #000a;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.tabs button {
  background: #232323;
  color: inherit;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  padding: 6px 14px;
  font: inherit;
  cursor: pointer;
}
.tabs button.active {
  background: #2e3b35;
  border-color: var(--link-color, #60f8b3);
}
dialog :global([data-pick]) {
  cursor: pointer;
}
dialog :global(.unavailable) {
  opacity: 0.35;
  pointer-events: none;
}
dialog :global(.current) {
  outline: 2px solid var(--link-color, #60f8b3);
  outline-offset: 1px;
}
</style>
