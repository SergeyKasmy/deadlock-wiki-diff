<script lang="ts">
import type { Navbox } from './lib/navbox.ts';

interface Props {
  /** null until the navboxes have loaded, which keeps the Select button disabled */
  navboxes: { hero: Navbox; item: Navbox | null } | null;
  /** the current pick; the dialog opens on its tab */
  current: { key: string; kind: 'hero' | 'item' } | null;
  onpick: (key: string) => void;
}
let { navboxes, current, onpick }: Props = $props();

let dialog = $state<HTMLDialogElement>();
let tab = $state<'hero' | 'item'>('hero');
const items = $derived(navboxes?.item ?? null);
const html = $derived((tab === 'item' && items ? items : navboxes?.hero)?.html ?? '');

function open() {
  tab = current?.kind === 'item' && items ? 'item' : 'hero';
  dialog?.showModal();
}

// the grid is wiki HTML, so the current pick is marked on it directly
const grid = (html: string) => (el: HTMLElement) => {
  el.innerHTML = html;
  if (current) el.querySelector(`[data-pick="${CSS.escape(current.key)}"]`)?.classList.add('current');
};

function click(e: MouseEvent) {
  if (e.target === dialog) {
    dialog.close(); // backdrop click
    return;
  }
  const key = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-pick]')?.dataset['pick'] : undefined;
  if (key === undefined) return;
  dialog?.close();
  onpick(key);
}
</script>

<button type="button" class="select" disabled={!navboxes} onclick={open}>Select</button>

<dialog bind:this={dialog} onclick={click}>
  {#if items}
    <div class="tabs">
      <button type="button" class:active={tab === 'hero'} onclick={() => (tab = 'hero')}>Heroes</button>
      <button type="button" class:active={tab === 'item'} onclick={() => (tab = 'item')}>Items</button>
    </div>
  {/if}
  <div class="mw-parser-output" {@attach grid(html)}></div>
</dialog>

<style>
.select {
  background: #232323;
  color: inherit;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  padding: 6px 8px;
  font: inherit;
  cursor: pointer;
}
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
