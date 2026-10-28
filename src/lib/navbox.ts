// The picker grids are the wiki's own {{Hero Navbox}} (the card grid at the top of /Heroes) and {{Item Navbox}} (items
// by type and price tier), rendered at runtime. Each pickable element gets a `data-pick` attribute with its key.

import type { Entry } from './subject.ts';
import { parse } from './wiki.ts';

export interface Navbox {
  css: string;
  html: string;
  /** key → a small copy of its element, shown in the header for the current pick */
  thumbs: Map<string, string>;
}

/** Renders `template`; on failure falls back to a plain list of `entries` built by `plain`. */
async function render(title: string, template: string, entries: Entry[], plain: (e: Entry) => HTMLElement) {
  try {
    const { css, doc } = await parse(template, title);
    const root = doc.querySelector('.mw-parser-output');
    if (!root) throw new Error('empty render');
    return { css, root };
  } catch (e) {
    console.warn(`${template} unavailable, using a plain list`, e);
    const root = document.createElement('div');
    root.append(...entries.map(plain));
    return { css: '', root };
  }
}

/**
 * Tags each element of `elems` named in `entries` with `data-pick`; the rest are listed on the wiki but have nothing to
 * compare, so they are dimmed. Links are dropped so clicks pick here instead of leaving for the wiki.
 */
function prepare(
  root: Element,
  elems: HTMLElement[],
  nameOf: (el: HTMLElement) => string | undefined,
  entries: Entry[],
) {
  root.querySelectorAll('a').forEach((a) => {
    a.removeAttribute('href');
  });
  const thumbs = new Map<string, HTMLElement>();
  for (const el of elems) {
    const entry = entries.find((e) => e.name === nameOf(el));
    if (!entry) el.classList.add('unavailable');
    else {
      el.dataset['pick'] = entry.key;
      const thumb = el.cloneNode(true);
      if (thumb instanceof HTMLElement) thumbs.set(entry.key, thumb);
    }
  }
  return thumbs;
}

const toHtml = (thumbs: Map<string, HTMLElement>) => new Map([...thumbs].map(([k, el]) => [k, el.outerHTML]));

export async function heroNavbox(heroes: Entry[]): Promise<Navbox> {
  const { css, root } = await render('Heroes', '{{Hero Navbox}}', heroes, (h) => {
    const el = document.createElement('div');
    el.className = 'HeroCard';
    el.dataset['heroName'] = h.name;
    el.style.cssText = 'width:auto;aspect-ratio:auto;padding:6px 10px';
    el.textContent = h.name;
    return el;
  });
  const cards = [...root.querySelectorAll<HTMLElement>('.HeroCard')];
  const nameOf = (c: HTMLElement) =>
    c.querySelector<HTMLElement>('[data-hero-name]')?.dataset['heroName'] ?? c.dataset['heroName'];
  const thumbs = prepare(root, cards, nameOf, heroes);
  for (const t of thumbs.values()) {
    t.style.width = '64px';
    t.querySelector<HTMLElement>('.HeroName')?.style.setProperty('--text-size', '12px');
  }
  return { css, html: root.innerHTML, thumbs: toHtml(thumbs) };
}

export async function itemNavbox(items: Entry[]): Promise<Navbox> {
  const { css, root } = await render('Items', '{{Item Navbox}}', items, (i) => {
    const el = document.createElement('span');
    el.className = 'item-nav-search-item';
    el.dataset['itemName'] = i.name;
    el.style.margin = '4px';
    el.textContent = i.name;
    return el;
  });
  root.querySelector('.item-nav-search-container')?.remove(); // the wiki's search box is filled by its own JS
  const elems = [...root.querySelectorAll<HTMLElement>('.item-nav-search-item')];
  const thumbs = prepare(root, elems, (e) => e.dataset['itemName'], items);
  return { css, html: root.innerHTML, thumbs: toHtml(thumbs) };
}
