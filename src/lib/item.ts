// Items: a single card from Data:ItemCards.json, or from Data:ItemData.json for patches before it existed.

import { type ItemCard, itemCards, itemData, lang, type LegacyItem, type StatLine } from './data.ts';
import { type Entry, type Kind, patchesWith, type Rendering, type Subject } from './subject.ts';
import { listPatches, matchRevision, memo, PAGES, parse, type Revision, sandboxTexts } from './wiki.ts';

const num = (v: unknown) => typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? +v : v;

const isStatList = (v: unknown): v is StatLine[] => Array.isArray(v);
const hasStatLists = (v: unknown): v is Record<'Main' | 'Alt', unknown> =>
  typeof v === 'object' && v !== null && 'Main' in v;

/**
 * Data:ItemCards.json only exists since 2026-03-02; older patches are in Data:ItemData.json, a flat file with string
 * numbers and no tooltip layout. The card needs that layout (Info/Main/Alt), so it is taken from the item's first
 * ItemCards revision and the old values are written over it.
 * shortcut: stats that old data has but the layout lacks are dropped, and layout changes before March are not shown; port the Info grouping if that matters.
 */
function legacyToCard(old: LegacyItem, layout: ItemCard): ItemCard {
  const card = structuredClone(layout);
  const fields = [
    'Name',
    'Description',
    'Cost',
    'Tier',
    'Slot',
    'Activation',
    'Components',
    'TargetTypes',
    'ShopFilters',
  ];
  for (const k of fields) if (k in old) card[k] = num(old[k]);
  card.IsDisabled = old['IsDisabled'] ?? old['Disabled'] ?? false;
  for (const info of Object.values(card).filter(hasStatLists)) {
    for (const list of ['Main', 'Alt'] as const) {
      const lines = info[list];
      if (!isStatList(lines)) continue;
      info[list] = lines.filter((e) => old[e.Key] !== undefined).map((e) => ({ ...e, Value: num(old[e.Key]) }));
    }
  }
  if (card.Other) {
    card.Other = Object.fromEntries(
      Object.entries(card.Other).filter(([k]) => old[k] !== undefined).map((
        [k, e],
      ) => [k, { ...e, Value: num(old[k]) }]),
    );
  }
  const upgrades = old['PropertyUpgrades'];
  card.Upgrades = Object.fromEntries(
    Object.entries(typeof upgrades === 'object' && upgrades !== null ? upgrades : {})
      .filter(([k]) => k in (layout.Upgrades ?? {}))
      .map(([k, v]) => [k, num(v)]),
  );
  return card;
}

/** Writes `value` into the infobox row labelled `label`. */
function setInfoboxValue(card: Element, label: string, value: string | undefined) {
  if (value === undefined) return;
  const cell = [...card.querySelectorAll('.infobox-label')].find((l) => l.textContent.trim() === label)
    ?.nextElementSibling;
  if (cell) (cell.querySelector('b') ?? cell).textContent = value;
}

/** The translation keys of a card's descriptions, in card order. */
const descKeys = (card: ItemCard): string[] =>
  JSON.stringify(card).match(/"DescKey":"[^"]+"/g)?.map((m) => m.slice(11, -1).replace('#', '')) ?? [];

const DESCRIPTIONS = '.passive-description, .active-description';

export async function itemKind(): Promise<Kind> {
  const [patches, langPatches] = await Promise.all([
    listPatches(PAGES.items),
    listPatches(PAGES.lang).catch((): Revision[] => []),
  ]);
  const firstCards = patches[0];
  if (!firstCards) return { entries: [], open: () => Promise.reject(new Error('no item data')) };
  // the pre-ItemCards history, converted on render by legacyToCard
  const legacy = (await listPatches(PAGES.legacyItems).catch((): Revision[] => []))
    .filter((r) => r.timestamp < firstCards.timestamp)
    .map((r) => ({ ...r, legacy: true }));
  const allPatches = [...legacy, ...patches];
  const layoutRevid = firstCards.revid;

  const entries: Entry[] = Object.entries(await itemCards()).flatMap(([key, v]) =>
    v.Name !== undefined && v.Tier !== undefined && v.IsDisabled !== true && v.StreetBrawl !== true
      ? [{ key, name: v.Name }]
      : []
  );

  /** Either file at `r`, as an item card; legacy revisions are converted. */
  async function cardAt(item: Entry, r: Revision, signal: AbortSignal): Promise<ItemCard | undefined> {
    if (r.legacy !== true) return (await itemCards(r.revid, signal))[item.key];
    const old = (await itemData(r.revid, signal))[item.key];
    if (old?.['Name'] === undefined) return undefined;
    const layout = (await itemCards(layoutRevid, signal))[item.key];
    if (!layout) throw new Error(`${item.name} has no card layout`);
    return legacyToCard(old, layout);
  }

  async function open(item: Entry, signal?: AbortSignal): Promise<Subject> {
    const revisions = await patchesWith(
      allPatches,
      itemCards,
      (d) => d[item.key]?.Name !== undefined,
      signal,
    );
    const current = (await itemCards(undefined, signal))[item.key];
    const currentKeys = current ? descKeys(current) : [];
    // Module:Infobox item maps renamed items' old names to the new ones (Backstabber → Stalker) before looking them up,
    // so an old name finds nothing; the current name goes in and the old one is written into the header afterwards
    const template = `{{Infobox item/auto|${item.name}|default=1}}`;

    /** Description elements rendered with old translations but current data. */
    const renderWithLang = memo(async (langRevid: number, signal) => {
      const texts = await lang(langRevid, signal);
      // InlineAttribute_*: the labels Module:Lang puts next to {g:citadel_inline_attribute:'…'} icons
      const keep = sandboxTexts(texts, (k) => k.startsWith('InlineAttribute_') || currentKeys.includes(k));
      const { doc } = await parse(template, item.name, { page: PAGES.lang, content: keep }, signal);
      return [...doc.querySelectorAll(DESCRIPTIONS)];
    });

    // An item is a single card; |default=1 makes the wiki skip its Default/Enhanced tabs, which need the wiki's JS.
    const render = memo(async (revid: number, signal): Promise<Rendering> => {
      const r = revisions.find((r) => r.revid === revid);
      const slice = r && await cardAt(item, r, signal);
      if (slice?.Name === undefined) throw new Error(`${item.name} is not in r${revid} yet, pick a later revision`);
      // Data:ItemCards only names each description's translation key, so the old texts come from a second render with
      // the old Data:Lang (TemplateSandbox swaps one page per request); the newest is what the first render already uses.
      // Both renders take about a second, so they run at the same time, and a failure cancels the other.
      const langPatch = r && matchRevision(langPatches, r);
      const sameKeys = descKeys(slice).join() === currentKeys.join();
      const done = new AbortController();
      const sig = AbortSignal.any([signal, done.signal]);
      try {
        const oldTexts = langPatch && langPatch !== langPatches.at(-1) && sameKeys
          ? renderWithLang(langPatch.revid, sig).catch((e: unknown) => {
            sig.throwIfAborted();
            console.warn('old translations unavailable, showing current texts', e);
            return null;
          })
          : null;
        const [{ css, doc }, texts] = await Promise.all([
          parse(
            template,
            item.name,
            { page: PAGES.items, content: { [item.key]: { ...slice, Name: item.name } } },
            sig,
          ),
          oldTexts,
        ]);
        const infobox = doc.querySelector('.infobox_item');
        if (!infobox) throw new Error('item card missing');
        const header = infobox.querySelector('.infobox-header span');
        if (header) header.textContent = slice.Name;
        // the wiki fills cost and tier from the current item data, whatever page is swapped in, so the old values are written in afterwards
        setInfoboxValue(infobox, 'Cost', slice.Cost?.toLocaleString('en-US'));
        setInfoboxValue(infobox, 'Tier', slice.Tier?.toString());
        if (texts) {
          infobox.querySelectorAll(DESCRIPTIONS).forEach((dst, i) => {
            const src = texts[i];
            if (src) dst.innerHTML = src.innerHTML;
          });
        }
        return { css, cards: [{ html: infobox.outerHTML }] };
      } finally {
        done.abort();
      }
    });

    return { ...item, kind: 'item', revisions, release: undefined, slots: 1, render };
  }

  return { entries, open };
}
