import type { Ability } from './data.ts';
import type { Revision } from './wiki.ts';

/** A hero or item that can be compared across patches. */
export interface Entry {
  key: string;
  name: string;
}

/** One rendered wiki card, as HTML. */
export interface Card {
  html: string;
  /** the row title the card provides (ability name) */
  title?: string;
  /** the ability data the upgrade gadget needs; only on ability cards */
  ability?: Ability;
}

export interface Rendering {
  /** the TemplateStyles the cards need; identical across revisions */
  css: string;
  /** slot 0 is the hero or item card, 1.. the abilities; null where a revision has no such card */
  cards: (Card | null)[];
}

export interface Subject extends Entry {
  kind: 'hero' | 'item';
  /** every patch that has this subject, oldest first; never empty */
  revisions: [Revision, ...Revision[]];
  /** the patch the subject was released in, the default for the "old" side */
  release: Revision | undefined;
  /** number of card rows: the hero/item card plus one per ability */
  slots: number;
  /** aborting `signal` cancels the requests no other render still waits on */
  render: (revid: number, signal?: AbortSignal) => Promise<Rendering>;
}

export const lastOf = <T>(list: readonly [T, ...T[]]): T => list[list.length - 1] ?? list[0];

/** The heroes or the items: what can be picked, and how to load one. */
export interface Kind {
  entries: Entry[];
  open: (entry: Entry, signal?: AbortSignal) => Promise<Subject>;
}

/**
 * The patches from the first one whose data passes `has`. Being present is monotonic (a hero or item is added once),
 * so a binary search finds it.
 */
export async function patchesWith<T>(
  list: Revision[],
  load: (revid: number, signal?: AbortSignal) => Promise<T>,
  has: (data: T) => boolean,
  signal?: AbortSignal,
): Promise<[Revision, ...Revision[]]> {
  const at = async (i: number) => {
    const r = list[i];
    return r !== undefined && has(await load(r.revid, signal));
  };
  let lo = 0, hi = list.length - 1;
  // entries from the start of the history need only this one fetch
  if (!(await at(0))) {
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      // deno-lint-ignore no-await-in-loop -- each step depends on the previous one
      if (await at(mid)) hi = mid;
      else lo = mid + 1;
    }
  }
  const [first, ...rest] = list.slice(lo);
  if (!first) throw new Error('no revisions');
  return [first, ...rest];
}
