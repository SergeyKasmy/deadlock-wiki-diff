// Items: a single card from Data:ItemCards.json, or from Data:ItemData.json for patches before it existed.

import { type ItemCard, itemCards, itemData, type LegacyItem, type StatLine } from './data.ts';
import { type Entry, type Kind, patchesWith, type Rendering, type Subject } from './subject.ts';
import { listPatches, memo, PAGES, parse, type Revision } from './wiki.ts';

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

export async function itemKind(): Promise<Kind> {
  const patches = await listPatches(PAGES.items);
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
  async function cardAt(item: Entry, r: Revision): Promise<ItemCard | undefined> {
    if (r.legacy !== true) return (await itemCards(r.revid))[item.key];
    const old = (await itemData(r.revid))[item.key];
    if (old?.['Name'] === undefined) return undefined;
    const layout = (await itemCards(layoutRevid))[item.key];
    if (!layout) throw new Error(`${item.name} has no card layout`);
    return legacyToCard(old, layout);
  }

  async function open(item: Entry): Promise<Subject> {
    const revisions = await patchesWith(
      allPatches,
      (revid) => itemCards(revid),
      (d) => d[item.key]?.Name !== undefined,
    );

    // An item is a single card; |default=1 makes the wiki skip its Default/Enhanced tabs, which need the wiki's JS.
    const render = memo(async (revid: number): Promise<Rendering> => {
      const r = revisions.find((r) => r.revid === revid);
      const slice = r && await cardAt(item, r);
      if (slice?.Name === undefined) throw new Error(`${item.name} is not in r${revid} yet, pick a later revision`);
      const { css, doc } = await parse(`{{Infobox item/auto|${slice.Name}|default=1}}`, item.name, {
        page: PAGES.items,
        content: { [item.key]: slice },
      });
      const card = doc.querySelector('.infobox_item');
      if (!card) throw new Error('item card missing');
      // the wiki fills cost and tier from the current item data, whatever page is swapped in, so the old values are written in afterwards
      setInfoboxValue(card, 'Cost', slice.Cost?.toLocaleString('en-US'));
      setInfoboxValue(card, 'Tier', slice.Tier?.toString());
      return { css, cards: [{ html: card.outerHTML }] };
    });

    return { ...item, kind: 'item', revisions, release: undefined, slots: 1, render };
  }

  return { entries, open };
}
