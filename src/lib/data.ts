// Shapes of the wiki's JSON data pages, as far as this app reads them. Deadbot writes them and they change between
// patches, so fields may be missing in old revisions and everything not relied on stays `unknown`.
// shortcut: the shapes are trusted, not validated at runtime; add a schema check if the wiki's data starts breaking the app.

import { pageJson, PAGES } from './wiki.ts';

export const SLOTS = ['1', '2', '3', '4'] as const;
export type Slot = (typeof SLOTS)[number];
export const INFOS = ['Info1', 'Info2', 'Info3'] as const;

export interface AbilityInfo {
  DescKey?: string;
  /** the upgrade tier (0-2) that reveals this info block */
  RequiresUpgradeIndex?: number;
}

export interface Scale {
  Type: string;
  Value: number;
  Multiply?: boolean;
}
export type UpgradeValue = number | string | { Value: number | string; Multiply?: boolean; Scale?: Scale | Scale[] };
/** an upgrade tier's stat changes, by the id of the element showing the stat; `DescKey` names its description */
export type Upgrade = Record<string, UpgradeValue>;

export interface Ability {
  Key: string;
  Name?: string;
  Info1?: AbilityInfo;
  Info2?: AbilityInfo;
  Info3?: AbilityInfo;
  Upgrades: Upgrade[];
  Headers?: Record<string, unknown>;
  /** early revisions keep the Ability* header stats here instead of in `Headers` */
  [key: string]: unknown;
}

export type HeroAbilities = { Name?: string } & Partial<Record<Slot, Ability>>;

export interface HeroStats {
  IsDisabled?: boolean;
  InDevelopment?: boolean;
  [key: string]: unknown;
}

export interface StatLine {
  Key: string;
  Value?: unknown;
  [key: string]: unknown;
}

export interface ItemCard {
  Name?: string;
  Cost?: number;
  Tier?: number;
  /** a boolean in Data:ItemCards.json; converted legacy cards pass Data:ItemData.json's flag through as it is */
  IsDisabled?: unknown;
  StreetBrawl?: boolean;
  Other?: Record<string, { Value?: unknown }>;
  Upgrades?: Record<string, unknown>;
  /** besides the above: Info sections with `Main` / `Alt` stat lists, and fields this app passes through */
  [key: string]: unknown;
}

/** a Data:ItemData.json item: stat key → value, numbers as strings */
export type LegacyItem = Record<string, unknown>;

/** Each data page at one revision (number) or its current one. */
export const abilityCards = (rev?: number): Promise<Record<string, HeroAbilities>> =>
  pageJson(rev ?? PAGES.abilities) as Promise<Record<string, HeroAbilities>>;
export const heroData = (rev?: number): Promise<Record<string, HeroStats>> =>
  pageJson(rev ?? PAGES.heroData) as Promise<Record<string, HeroStats>>;
export const lang = (rev: number): Promise<Record<string, string>> => pageJson(rev) as Promise<Record<string, string>>;
export const itemCards = (rev?: number): Promise<Record<string, ItemCard>> =>
  pageJson(rev ?? PAGES.items) as Promise<Record<string, ItemCard>>;
export const itemData = (rev: number): Promise<Record<string, LegacyItem>> =>
  pageJson(rev) as Promise<Record<string, LegacyItem>>;
