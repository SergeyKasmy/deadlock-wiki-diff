// Heroes: a hero card from Data:HeroData.json plus one card per ability from Data:AbilityCards.json.

import {
  type Ability,
  abilityCards,
  type HeroAbilities,
  heroData,
  type HeroStats,
  INFOS,
  lang,
  type Slot,
  SLOTS,
} from './data.ts';
import { type Entry, type Kind, lastOf, patchesWith, type Rendering, type Subject } from './subject.ts';
import { listPatches, matchRevision, memo, PAGES, parse, type Revision, wikitext } from './wiki.ts';

/** Every playable hero with ability data, from the wiki's current data, so new heroes show up on their own. */
async function listHeroes(): Promise<Entry[]> {
  const [abilities, stats] = await Promise.all([abilityCards(), heroData()]);
  return Object.entries(abilities)
    .flatMap(([key, a]) => {
      const hd = stats[key];
      const playable = hd !== undefined && hd.IsDisabled !== true && hd.InDevelopment !== true;
      return a.Name !== undefined && playable && SLOTS.some((s) => a[s]) ? [{ key, name: a.Name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** {{Infobox hero …}} with its static arguments (release date, codenames, pronouns) copied from the hero's page. */
async function heroInfobox(hero: Entry, signal?: AbortSignal): Promise<string> {
  const fallback = `{{Infobox hero|key=${hero.key}}}`;
  const wt = await wikitext(hero.name, signal);
  const start = wt.search(/\{\{\s*Infobox hero/i);
  if (start < 0) return fallback;
  let depth = 0;
  for (let i = start; i < wt.length - 1; i++) {
    const two = wt.slice(i, i + 2);
    if (two === '{{') {
      depth++;
      i++;
    } else if (two === '}}') {
      if (--depth === 0) return wt.slice(start, i + 2);
      i++;
    }
  }
  return fallback;
}

/** The infobox holds e.g. `release_date = [[Update:February 9, 2026|February 9, 2026]]`; NaN without one. */
const releaseDate = (infobox: string) =>
  Date.parse((/release_date\s*=\s*(?:\[\[[^|\]]*\|)?([^\]\n|]+)/.exec(infobox)?.[1] ?? '') + ' UTC');

/**
 * Early revisions keep Ability* stats (cooldown, cast range, duration…) at the ability's top level; the current card
 * module only reads them from `Headers`, so without this the old cards lose their header boxes. Edits in place.
 */
function hoistHeaders(slice: HeroAbilities): HeroAbilities {
  for (const s of SLOTS) {
    const a = slice[s];
    if (!a || a.Headers) continue;
    const headers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a)) {
      if (k.startsWith('Ability') && typeof v === 'object' && v !== null) {
        headers[k] = v;
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- moving an unknown set of keys is the point
        delete a[k];
      }
    }
    a.Headers = headers;
  }
  return slice;
}

/**
 * HeroData only stores the dash speeds since v1.6.0 (2026-02-11); before that the hero card shows 0. The stored value
 * is always distance / duration rounded to 0.1 (true for every hero in the current data), so it is derived for older
 * revisions.
 */
function fillDashSpeeds(hd: HeroStats | undefined): HeroStats {
  const out = { ...hd };
  for (const m of ['Ground', 'Air']) {
    const dist = out[`${m}DashDistanceInMeters`], dur = out[`${m}DashDuration`];
    const speed = out[`${m}DashSpeed`];
    const known = speed !== undefined && speed !== null;
    if (!known && typeof dist === 'number' && dist !== 0 && typeof dur === 'number' && dur !== 0) {
      out[`${m}DashSpeed`] = Math.round(dist / dur * 10) / 10;
    }
  }
  return out;
}

/** Copies description texts from the old-translation render into the old-data card, where both use the same DescKey. */
function spliceDescriptions(card: Element, langCard: Element, oldAb: Ability, curAb: Ability) {
  if (oldAb.Key !== curAb.Key) return;
  INFOS.forEach((info, k) => {
    const dk = oldAb[info]?.DescKey;
    const j = dk === undefined ? -1 : INFOS.findIndex((i) => curAb[i]?.DescKey === dk);
    const dst = card.querySelector(`#ability-info${k + 1} .ac-info-desc`);
    const src = j < 0 ? null : langCard.querySelector(`#ability-info${j + 1} .ac-info-desc`);
    if (dst && src) dst.innerHTML = src.innerHTML;
  });
  [1, 2, 5].forEach((cost, i) => {
    const dk = oldAb.Upgrades[i]?.['DescKey'];
    if (dk === undefined || curAb.Upgrades[i]?.['DescKey'] !== dk) return;
    const dst = card.querySelector(`#ability-upgrade-${cost} .ac-upgrade-desc`);
    const src = langCard.querySelector(`#ability-upgrade-${cost} .ac-upgrade-desc`);
    if (dst && src) dst.replaceWith(src.cloneNode(true)); // the font size depends on the text length, so the element is copied whole
  });
}

/**
 * Upgrades whose text was dropped from the current data (no DescKey) have no element in the old-translation render to
 * copy from, so the old text is rendered on its own into the old-data card's upgrade. Returns the work to await.
 */
function upgradeTextsMissingNow(
  card: Element,
  oldAb: Ability,
  curAb: Ability,
  texts: Record<string, string>,
  title: string,
  signal: AbortSignal,
): Promise<void>[] {
  if (oldAb.Key !== curAb.Key) return [];
  return [1, 2, 5].flatMap((cost, i) => {
    const dk = oldAb.Upgrades[i]?.['DescKey'];
    const text = typeof dk === 'string' ? texts[dk] : undefined;
    const dst = card.querySelector(`#ability-upgrade-${cost} .ac-upgrade-desc`);
    if (text === undefined || curAb.Upgrades[i]?.['DescKey'] !== undefined || !dst) return [];
    return [
      parse(text, title, undefined, signal).then(({ doc }) => {
        dst.innerHTML = doc.querySelector('p')?.innerHTML ?? text;
      }),
    ];
  });
}

export async function heroKind(): Promise<Kind> {
  const [abilityPatches, entries, langPatches, heroDataPatches] = await Promise.all([
    listPatches(PAGES.abilities),
    listHeroes(),
    // optional: without them old cards keep the current texts / stats
    listPatches(PAGES.lang).catch((): Revision[] => []),
    listPatches(PAGES.heroData).catch((): Revision[] => []),
  ]);

  async function open(hero: Entry, signal?: AbortSignal): Promise<Subject> {
    const [head, infobox] = await Promise.all([
      abilityCards(undefined, signal).then((d) => d[hero.key]),
      heroInfobox(hero, signal),
    ]);
    if (!head) throw new Error(`${hero.name} has no ability data`);
    const slots = SLOTS.filter((s) => head[s] !== undefined);
    const abilityKeys = slots.map((s) => head[s]?.Key ?? '');
    const common = abilityKeys.reduce((a, b) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return a.slice(0, i);
    });
    // what renderWithLang keeps from the ~1 MB translation file
    const prefix = common.slice(0, common.lastIndexOf('_') + 1); // e.g. ability_unicorn_
    const langPrefix = prefix === '' ? 'ability_' : prefix;
    const descKeys = new Set(JSON.stringify(head).match(/"DescKey":"[^"]+"/g)?.map((m) => m.slice(11, -1)));

    // the list starts where the hero got its abilities (Seven: the start of the history)
    const revisions = await patchesWith(
      abilityPatches,
      abilityCards,
      (d) => d[hero.key]?.['1'] !== undefined,
      signal,
    );
    const released = releaseDate(infobox);
    const release = revisions.find((r) => Date.parse(r.timestamp) >= released); // NaN matches nothing
    const latest = lastOf(revisions);

    async function abilitiesAt(revid: number, signal: AbortSignal): Promise<HeroAbilities> {
      const slice = (await abilityCards(revid, signal))[hero.key];
      // unreleased heroes sit in the file as a bare { Name } stub
      if (!slice?.['1']) throw new Error(`${hero.name} has no abilities in r${revid} yet, pick a later revision`);
      return slice;
    }

    /**
     * Ability cards, one per slot (null where `slice` has no ability). TemplateSandbox swaps only one page per
     * request, so old numbers (Data:AbilityCards) and old texts (Data:Lang) are rendered separately and merged.
     */
    async function renderAbilities(
      sandboxPage: string,
      sandboxContent: unknown,
      slice: HeroAbilities,
      signal: AbortSignal,
    ) {
      const present: Slot[] = slots.filter((s) => slice[s] !== undefined);
      const text = present.map((s) => `{{AbilitySection|hero_name=${hero.name}|ability_num=${s}}}`).join('');
      const { css, doc } = await parse(text, hero.name, { page: sandboxPage, content: sandboxContent }, signal);
      const found = [...doc.querySelectorAll('.ability-card')];
      if (found.length !== present.length) throw new Error('render failed');
      const cards = slots.map((s) => found[present.indexOf(s)] ?? null);
      return { css, cards };
    }

    /** Cards rendered with old translations but current data: only their description elements are used. */
    const renderWithLang = memo(async (langRevid: number, signal) => {
      const texts = await lang(langRevid, signal);
      const keep = Object.fromEntries(
        Object.entries(texts).filter(([k]) => k.startsWith(langPrefix) || descKeys.has(k)).map((
          [k, v],
        ) => [k, v.replace(/\{\{[^{}]*\}\}/g, (t) => t.replaceAll('|', '{{!}}'))]), // the card module cuts text at a template's `|`
      );
      return (await renderAbilities(PAGES.lang, keep, head, signal)).cards;
    });

    /** The hero card, with Data:HeroData.json swapped for the revision of the same patch. */
    async function renderHeroCard(patch: Revision, signal: AbortSignal) {
      const hd = matchRevision(heroDataPatches, patch);
      const sandbox = hd && {
        page: PAGES.heroData,
        content: { [hero.key]: fillDashSpeeds((await heroData(hd.revid, signal))[hero.key]) },
      };
      const { css, doc } = await parse(infobox, hero.name, sandbox, signal);
      const card = doc.querySelector('.infobox-h');
      if (!card) throw new Error('hero card missing');
      return { css, html: card.outerHTML };
    }

    const render = memo(async (revid: number, signal): Promise<Rendering> => {
      const patch = revisions.find((r) => r.revid === revid);
      if (!patch) throw new Error(`r${revid} is not a ${hero.name} revision`);
      // The three renders don't depend on each other and each takes 0.5-1.5 s, so they run at the same time; when one
      // fails the others are cancelled instead of loading the wiki for nothing.
      const done = new AbortController();
      const sig = AbortSignal.any([signal, done.signal]);
      try {
        const abilities = abilitiesAt(revid, sig).then(async (data) => {
          const slice = hoistHeaders(structuredClone(data));
          // only the hero's slice is sent: it renders identically to the full file, but ~100x smaller
          return { slice, ...(await renderAbilities(PAGES.abilities, { [hero.key]: slice }, slice, sig)) };
        });
        const langPatch = matchRevision(langPatches, patch);
        // the newest translations are what the renderer already used
        const oldTexts = langPatch && langPatch !== langPatches.at(-1)
          ? Promise.all([renderWithLang(langPatch.revid, sig), abilitiesAt(latest.revid, sig)]).catch((e: unknown) => {
            sig.throwIfAborted();
            console.warn('old translations unavailable, showing current texts', e);
            return null;
          })
          : null;
        const heroCardP = renderHeroCard(patch, sig).catch((e: unknown) => {
          sig.throwIfAborted();
          console.warn('hero card unavailable', e);
          return null;
        });
        const [{ slice, css, cards }, texts, heroCard] = await Promise.all([abilities, oldTexts, heroCardP]);

        if (texts && langPatch) {
          const [langCards, current] = texts;
          const oldLang = await lang(langPatch.revid, sig);
          const extra: Promise<void>[] = [];
          slots.forEach((s, i) => {
            const card = cards[i], langCard = langCards[i], oldAb = slice[s], curAb = current[s];
            if (!card || !langCard || !oldAb || !curAb) return;
            spliceDescriptions(card, langCard, oldAb, curAb);
            extra.push(...upgradeTextsMissingNow(card, oldAb, curAb, oldLang, hero.name, sig));
          });
          await Promise.all(extra).catch((e: unknown) => {
            sig.throwIfAborted();
            console.warn('old upgrade texts unavailable', e);
          });
        }
        return {
          css: heroCard ? `${css}\n${heroCard.css}` : css,
          cards: [
            heroCard && { html: heroCard.html },
            ...slots.map((s, i) => {
              const card = cards[i], ability = slice[s];
              return card && ability
                ? { html: card.outerHTML, title: card.querySelector('.ac-name')?.textContent ?? '', ability }
                : null;
            }),
          ],
        };
      } finally {
        done.abort();
      }
    });

    return { ...hero, kind: 'hero', revisions, release, slots: slots.length + 1, render };
  }

  return { entries, open };
}
