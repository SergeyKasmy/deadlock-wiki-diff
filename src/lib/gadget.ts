// Port of MediaWiki:Gadget-ability-upgrades.js: clicking an ability's upgrade boxes applies the upgrades to the card's
// numbers. Scoped to one card so the two sides don't share state.

import { type Ability, INFOS, type Scale } from './data.ts';

interface Tier {
  /** position in the ability's `Upgrades`, and the `RequiresUpgradeIndex` of info blocks it reveals */
  index: number;
  /** ability points; the wiki ids the upgrade boxes by it */
  cost: number;
  enabled: boolean;
}
const UPGRADE_COSTS = [1, 2, 5];
// without `digits`, small numbers are kept as is and only |n| >= 1 is rounded, as in the wiki's gadget
const round = (n: number, digits?: number) => Math.abs(n) >= 1 ? Number(n.toFixed(3)) : Number(n.toPrecision(digits));

export function attachGadget(card: HTMLElement, ability: Ability, onChange: () => void): void {
  const tiers: Tier[] = UPGRADE_COSTS.map((cost, index) => ({ index, cost, enabled: false }));
  const original = new Map<string, string>(); // innerHTML before any upgrade, to revert to
  const boxes = [...card.querySelectorAll<HTMLElement>('.ability-upgrade')];
  const tierOf = (box: HTMLElement) => Number(box.dataset['index']);

  // hovering previews which tiers a click would toggle: enabling also enables the lower ones, disabling the higher ones
  const hover = (box: HTMLElement) => {
    const idx = tierOf(box), on = box.classList.contains('selected');
    for (const b of boxes) {
      if (b.classList.contains('selected') === on && (on ? tierOf(b) >= idx : tierOf(b) <= idx)) {
        b.classList.add('hovered');
      }
    }
  };
  const unhover = () => {
    for (const b of boxes) b.classList.remove('hovered');
  };

  function updateElem(key: string, elem: Element, value: number | string, revert: boolean, multiply: boolean) {
    const saved = original.get(key);
    if (revert) {
      if (saved !== undefined) elem.innerHTML = saved;
    } else {
      if (saved === undefined) original.set(key, elem.innerHTML);
      const cur = parseFloat(elem.innerHTML);
      elem.innerHTML = String(
        multiply ? round(cur * +value, 3) : round(cur + round(parseFloat(String(value).replace(/[sm]/g, ''))), 3),
      );
      const attr = elem.closest('.ability-attr');
      if (attr) {
        attr.classList.add('highlight');
        setTimeout(() => {
          attr.classList.remove('highlight');
        }, 450);
      }
    }
    elem.closest('.ability-headerattr, .ability-mainbox, .ability-altbox')
      ?.classList.toggle('hide', elem.innerHTML.trim() === '0');
  }

  function toggle(tier: Tier, enable: boolean) {
    const i = tier.index;
    const info = INFOS.findIndex((k) => ability[k]?.RequiresUpgradeIndex === i);
    if (info >= 0) card.querySelector(`#ability-info${info + 1}`)?.classList.toggle('hide', !enable);
    // old revisions can have fewer upgrades than the card shows boxes
    for (const [key, v] of Object.entries(ability.Upgrades[i] ?? {})) {
      const value = typeof v === 'object' ? v.Value : v;
      const multiply = typeof v === 'object' && (v.Multiply ?? false);
      if (typeof v === 'object') {
        // several scales: only spirit is shown
        const scale: Scale | undefined = Array.isArray(v.Scale) ? v.Scale.find((s) => s.Type === 'spirit') : v.Scale;
        const scaleElem = card.querySelector(`#${CSS.escape(key + '-scale')}`);
        // shortcut: melee / weapon_power scaling needs Data:HeroData (never used by Celeste), port it when adding other heroes
        if (scaleElem && scale) {
          const scaleValue = scale.Type === 'weapon_power' ? scale.Value / 100 : scale.Value;
          updateElem(`${i}-${key}-scale`, scaleElem, scaleValue, !enable, scale.Multiply ?? false);
        }
      }
      card.querySelectorAll(`#${CSS.escape(key)}`).forEach((el, n) => {
        updateElem(`${i}-${key}-${n}`, el.querySelector('b') ?? el, value, !enable, multiply);
      });
    }
    tier.enabled = enable;
    card.querySelector(`#ability-upgrade-${tier.cost}`)?.classList.toggle('selected', enable);
  }

  // enabling a tier also enables the ones below it, disabling one also disables the ones above it
  function click(box: HTMLElement) {
    const tier = tiers.find((t) => box.id === `ability-upgrade-${t.cost}`);
    if (!tier) return;
    if (tier.enabled) {
      for (const t of tiers.slice(tier.index).reverse()) if (t.enabled) toggle(t, false);
    } else {
      for (const t of tiers.slice(0, tier.index + 1)) if (!t.enabled) toggle(t, true);
    }
    unhover();
    hover(box);
    onChange();
  }

  for (const b of boxes) {
    b.addEventListener('mouseenter', () => {
      hover(b);
    });
    b.addEventListener('mouseleave', unhover);
  }
  card.addEventListener('click', (e) => {
    const box = e.target instanceof Element ? e.target.closest<HTMLElement>('.ability-upgrade') : null;
    if (box) click(box);
  });
  card.addEventListener('keydown', (e) => {
    const target = e.target;
    if (
      (e.key === 'Enter' || e.key === ' ') && target instanceof HTMLElement &&
      target.classList.contains('ability-upgrade')
    ) {
      e.preventDefault();
      target.click();
    }
  });
}
