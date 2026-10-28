# Plan: Celeste ability cards, old vs new, side by side (deadlock.wiki)

## Goal
A single static HTML page. It shows Celeste's four ability cards twice, side by side:

- Left = an older data version, right = a newer one.
- Default: left = release day (Feb 9, 2026), right = latest.
- Each side has a dropdown at the top to pick any revision.
- Cards must look and behave like the live wiki cards, including clicking the T1/T2/T3 upgrade buttons to show what each upgrade does.
- Differences are highlighted red on the old side and green on the new side. Reverted changes don't show, because only net differences between the two chosen versions count.

## Why wiki page history shows new stats (root cause)
- The Celeste page wikitext holds no numbers. It only has `{{AbilitySection | hero_name = Celeste | ability_num = N}}` (N = 1..4) plus notes and tips.
- `Template:AbilitySection` calls `{{#invoke:AbilitySection}}`.
- That module uses `Module:Abilities/card`, which calls `mw.loadJsonData(...)` on live data pages. Viewing an old page revision renders old wikitext but loads the current modules and current data.
- Old stats exist only in the history of the data pages.

## Site facts
- MediaWiki. Skin: Citizen, dark theme. Font: Inter. `--link-color: #60f8b3`. Body text colour: `oklch(0.953948 0.0168318 58.6608)`.
- Extensions present: Scribunto, TemplateSandbox, JsonConfig, TemplateStyles, Gadgets.
- Celeste: hero key `hero_unicorn`, release date Feb 9, 2026.
- The tab I used was an old revision view ("Revision as of 00:37, 10 February 2026"). Cards still rendered current data.

### Abilities (page order = ability_num 1..4; card DOM id is `hero_unicorn:<key>`)
| num | name | key |
|---|---|---|
| 1 | Light Eater | ability_unicorn_radiantblast |
| 2 | Dazzling Trick | ability_unicorn_prismaticguard |
| 3 | Radiant Daggers | ability_unicorn_luminousstrike |
| 4 | Shining Wonder | ability_unicorn_dazzlingorb |

### Data pages (JsonConfig, namespace `Data:`)
- `Data:AbilityCards.json`
  - About 68 hero keys. `hero_unicorn` is about 6 KB.
  - Shape: `{ "1": {Key, Name, DescKey, Info1:{Main:{Props:[{Value, Scale:{Value,Type}}]}, Alt:[...], DescKey}, Info2, Upgrades:[3 objects], Move, Other, AbilityCastDelay, AbilityCastRange, AbilityCooldown, AbilityCooldownBetweenCharge, AbilityDuration}, "2".."4", "Name" }`
  - Upgrades is an array of 3 objects: tiers T1, T2, T3 (costs 1, 2, 5).
  - Each upgrade object maps a stat key (e.g. `AbilityCooldown: -10`, `Damage:{Value,Scale:{Value,Type}}`) and may have `DescKey`.
  - Scale Types seen in Celeste: spirit, duration, healing, and others. No melee/heavy_melee/weapon_power anywhere in her data, in any version.
- `Data:HeroData.json`: hero stats. Used by the card module only for melee scaling and by the gadget for melee/weapon_power scaling. Celeste's LightMeleeDamage/HeavyMeleeDamage are constant at 50/116 across all versions. So HeroData does not need version-switching for Celeste.
- `Data:ResourceLookup.json`, `Data:Dictionary`: icons and labels. The current versions are fine for all old data (no render errors).
- `Data:AbilityData.json`: loaded by the gadget, but only an existence check (`window.abilityData[abilityKey]`).
- Raw fetch of any revision: `https://deadlock.wiki/index.php?title=Data:AbilityCards.json&oldid=<REV>&action=raw`.

### Revision history of the data pages (since 2026-02-09)
- AbilityCards: 74 revisions. HeroData: 46. ResourceLookup: 16. Almost all are by the bot, with comment "Deadbot vX.Y.Z-NNNN".
- Exclude non-bot revisions. Example: rev 103792 ("ability-cards tests"), undone by rev 103795.
- List revisions via API:
  `api.php?action=query&prop=revisions&rvprop=ids|timestamp|comment&rvlimit=500&rvdir=newer&rvstart=2026-02-09T00:00:00Z&titles=Data:AbilityCards.json&format=json&formatversion=2`
- After keeping only bot revisions and collapsing consecutive revisions where the `hero_unicorn` slice is identical, there are 22 distinct Celeste versions:

| # | rev | date | patch label |
|---|---|---|---|
| 0 | 58567 | 2026-02-09 | v1.5.5-6267 (release baseline) |
| 1 | 59320 | 2026-02-13 | v1.6.1-6290 |
| 2 | 59416 | 2026-02-14 | v1.6.1-6301 |
| 3 | 59647 | 2026-02-17 | v1.6.1-6323 |
| 4 | 60677 | 2026-02-26 | v1.7.0-6351 |
| 5 | 61655 | 2026-03-06 | v1.8.1-6359 |
| 6 | 62372 | 2026-03-11 | v1.8.1-6384 |
| 7 | 62999 | 2026-03-21 | v1.9.3-6404 |
| 8 | 63387 | 2026-03-26 | v1.9.3-6413 |
| 9 | 64421 | 2026-04-11 | v1.9.4-6446 |
| 10 | 66944 | 2026-04-30 | v1.10.0-6468 |
| 11 | 72789 | 2026-05-22 | v1.11.2-6514 |
| 12 | 87273 | 2026-06-30 | v1.14.0-6601 |
| 13 | 103965 | 2026-07-28 | v1.16.0-6642 |
| 14 | 106390 | 2026-08-09 | v1.17.0-6673 |
| 15 | 114010 | 2026-08-22 | v1.17.0-6684 |
| 16 | 157676 | 2026-09-16 | v1.17.1-6694 |
| 17 | 159823 | 2026-09-29 | v1.17.2-6712 |
| 18 | 177118 | 2026-09-30 | v1.18.1-6726 |
| 19 | 184201 | 2026-10-06 | v1.18.2-6757 |
| 20 | 188774 | 2026-10-12 | v1.18.5-6774 |
| 21 | 204927 | 2026-10-24 | v1.18.7-6819 (current at time of research) |

- Re-run the revision listing when building, because newer revisions may exist.
- The gadget-relevant data (Key, Upgrades, RequiresUpgradeIndex) has only 10 unique values across these 22 versions. Upgrade changes happened around 2026-02-14, 03-21, 03-26, 04-11, 05-22, 06-30 and 08-22 (approximately).

## Key technique: render old cards with the wiki's own renderer (verified)
TemplateSandbox lets one `action=parse` request substitute a different version of ONE page.

```
POST /api.php
  action=parse, format=json, formatversion=2, prop=text
  contentmodel=wikitext
  title=Celeste
  text={{AbilitySection|hero_name=Celeste|ability_num=1}}   (repeat for 2,3,4, one request can hold all four)
  templatesandboxtitle=Data:AbilityCards.json
  templatesandboxtext=<raw JSON of the old revision>
  templatesandboxcontentmodel=json
  templatesandboxcontentformat=application/json
```

- Only ONE page can be overridden per request. That is enough here (see HeroData note above).
- Verified: release-day data (rev 58567) renders Light Eater with 20% Spirit Lifesteal, 50 Flare Damage, 12s Duration. Current data renders 18%, 40, 8s with new scaling.
- Parse the returned HTML, take each `.ability-card` element. The returned HTML also contains TemplateStyles `<style>` blocks and the notes/tips tabs (ignore the tabs).
- Cards rendered fine (no "Lua error") for all 22 versions.
- Reduce HTML for storage:
  - Drop `srcset`, `decoding`, `loading`, `data-file-*`, and `<link rel="mw-deduplicated-inline-style">`.
  - Replace `<img src>` with an index into an image table.
  - Collapse whitespace.

## Release-vs-current data differences seen (partial; recompute everything)
A raw diff of `hero_unicorn` (rev 58567 vs the version current at the time) found 82 differing fields. I only saw the start of the list:
- Light Eater: lifesteal 20 → 18, now with a healing scale of 1; flare damage 50 → 40, scale 0.35 → 0.47; duration 12 → 8, now with spirit scale 0.05 plus a duration scale.
- Light Eater On Bullet Hit: damage 25 → 15, scale 0.23 → 0.34.
- Light Eater upgrades: the T1 and T2 effects swapped (T1 was −10 cooldown, now lifesteal +15; T2 is now −10 cooldown); T3 damage 25 → 22; unit target limit 1 → 100.
- Some top-level fields (AbilityCastDelay, AbilityCastRange, AbilityCooldown, ...) disappeared or moved.
- The rest, covering abilities 2–4, was truncated. Raw diffs include field reshuffles that are not real balance changes, so highlighting should be on rendered text, not on raw data.

## Card DOM (what the wiki produces)
- Root: `<div id="hero_unicorn:ability_unicorn_xxx" class="ability-card">`, about 500px wide, background `rgb(35,35,35)`, roughly 14 KB of HTML each.
- Important classes:
  - `ac-header-wrapper`, `ac-header`, `ac-header-left`, `ac-title`, `ac-icon`, `ac-name`, `ac-header-attrs`, `ac-header-right`, `ac-charge-row`
  - `ability-headerattr` (+ `hide`), `ability-attr`, `ability-scaling`, `ability-scaling-attr`
  - `ability-info ac-info-section`, `ability-mainbox` / `ability-altbox` (+ `hide`)
  - `ac-mainbox-inner`, `ac-mainbox-value`, `ac-mainbox-label`, `ac-mainbox-scale`, `ac-mainbox-scale-badge`
  - `ac-upgrades`
  - `ac-upgrade-descwrap`, `ac-upgrade-desc` (font sizes use `cqw` units with `container-type: inline-size`)
- Upgrade buttons: `<div id="ability-upgrade-1|2|5" data-index="…" tabindex="0" class="cdx-button cdx-button--action-progressive ability-upgrade">`. The ID suffix is the cost (1, 2, 5). The gadget maps cost to index with `{1:0, 2:1, 5:2}`.
- Value elements have ids equal to the stat key, e.g. `<span id="AbilityLifestealPercentHero" class="ability-attr">`, scaling `<span id="FlareDamage-scale" …>`, info boxes `#ability-info1..3`. The gadget finds them with `card.querySelector('#…')`, so the duplicate ids across the left and right sides work as long as lookups stay scoped to one card.
- Images: 24 unique PNGs, about 39 KB total. Names include 45px ability icons (Light_Eater, Dazzling_Trick, Radiant_Daggers, Shining_Wonder) and 15–28px stat icons (Spirit_scaling 28/20px, Spirit_damage, Spirit_Armor, Bullet_Armor, Healing, Move_speed, Fire_Rate, CastRange, MoveSlow, Ability_point, AttributeIconTechCooldown / TechRange / TechDuration / MaxChargesIncrease / TechCooldownBetweenChargeUses).

## Upgrade interactivity (copy from the wiki gadget)
Source of truth: `MediaWiki:Gadget-ability-upgrades.js` (~10.6 KB) and `MediaWiki:Gadget-ability-upgrades.css`. Fetch them raw. Behavior, as read:
- On load it fetches `/Data:AbilityData.json`, `/Data:AbilityCards.json`, `/Data:HeroData.json` into `window.abilityData`, `window.abilityCardData`, `window.heroData`. For the artifact, inject the chosen version's data instead.
- Click on `.ability-upgrade`: cumulative behaviour. Turning on tier N enables all lower tiers; turning off removes that tier and all higher ones. Per-ability state is kept in `state[abilityKey]`. It adds `selected` to the button.
- `toggleUpgrade`:
  - Reads `abilityCardData[hero][1..4]` where `.Key` equals the ability key, then `.Upgrades[tierIndex]`.
  - Shows or hides info boxes using `InfoN.RequiresUpgradeIndex`.
  - For every key in the upgrade object, finds `#key` elements in the card. If the upgrade value is an object `{Value, Scale}`, it also updates `#key-scale`. `updateElem` adds the value, or multiplies it if `Multiply` is set, rounds to 3 significant figures, and reverts when toggling off. Zero values add the `hide` class to the parent `.ability-headerattr / .ability-mainbox / .ability-altbox`.
  - Melee and weapon-power scaling use `heroData[hero]` values. This is unused for Celeste.
- Hover logic highlights the tiers that would turn on or off (`hovered` class).
- Keyboard: Enter or Space on a focused button clicks it.
- Required change: make it a factory per side (`createGadget(rootElement, abilityCardDataForThatVersion)`). The original keeps global state keyed by ability key, which would collide between left and right.

## Styling
- Collect every CSS rule that applies to the cards. Method: loop `document.styleSheets`, keep rules whose selector (with pseudo-classes and the state classes `.selected/.hovered/.hide` stripped) matches any element inside `.ability-card`. That gave 87 rules, about 10.7 KB (8.3 KB deduplicated and minified). They come from three places: the Codex button CSS (`cdx-button`), the TemplateStyles `Template:Ability card v2/Card/styles.css`, and `Gadget-ability-upgrades.css`.
- CSS variables used: `--font-size-medium` (falls back to 1rem) and `--link-color: #60f8b3`.
- Cards need a dark wiki-like surface. Put them in a wrapper that fixes the wiki text colour and font (Inter) so they look identical in any page theme. Wrap in `.mw-parser-output` because TemplateStyles rules are prefixed with it.

## Highlighting design
- For each ability, diff the two cards' non-empty text nodes with LCS (in document order).
- Unmatched text nodes on the left get a red highlight, on the right a green one.
- If a text node sits inside an element that has an `id` (those are the gadget-managed value elements) or inside the `<b>` of one, add the class to that element. Otherwise wrap the text node in a `<span>`. The gadget parses `innerHTML` of those elements with `parseFloat`, so never wrap text inside them.
- Recompute after every upgrade click, version change and hover reset: remove old highlight spans and classes first, then diff again.
- Hidden (display:none) text, such as upgrade descriptions before they are shown, is still diffed and highlighted when shown.
- Added or removed elements (a new stat row, for example) are detected through their text nodes.
- Optionally show a one-line count of changed values per ability.

## Page structure
- Header with two dropdowns ("Old" and "New"). Option label: `2026-02-09 · v1.5.5-6267 · r58567`. Default old = first, new = last. Optional "swap sides" button.
- Four rows (abilities 1–4). Each row has the old card on the left and the new card on the right. Narrow screens stack them.
- Image hosting: the artifact page host blocks external resources. Embed the 24 images as data URIs, or test whether hotlinking `https://deadlock.wiki/images/...` works where this will be hosted. Link `href`s should be rewritten from `/Page` to `https://deadlock.wiki/Page`.

## Data compaction I validated
Not needed if Claude Code can fetch and inline directly. For reference:
- Dictionary-encode the HTML of all 22 versions: tokenize tags and text, 304 unique tokens (about 10 KB), version 0 as ~2,174 token ids, later versions as LCS patches against the previous one (about 2.6 KB total). Verified lossless.
- Gadget data per version: store only `{Key, Upgrades, InfoN:{RequiresUpgradeIndex}}` for the four abilities (about 1 KB per version, 10 unique). Store as version 0 plus deltas (about 1.5 KB). Verified lossless (key order differences are irrelevant).
- Total payload about 24 KB plus about 8 KB CSS, 7.5 KB gadget JS, about 40 KB images. Page total under 100 KB.

## Build steps for Claude Code
1. Write a Node or Python script that:
   - Lists bot revisions of `Data:AbilityCards.json` since release, fetches each raw revision, and keeps versions where the `hero_unicorn` slice changed.
   - For each version, POSTs the TemplateSandbox parse request (above), extracts the four `.ability-card` elements and the TemplateStyles CSS, and normalizes the HTML.
   - Builds the per-version gadget data and downloads the 24 images, converting them to data URIs.
   - Fetches the gadget JS and CSS and the card styles CSS.
2. Generate one self-contained `index.html` embedding all of this, with the factory-style gadget and the diff highlighter.
3. Add a small caching layer (optional) so reruns only fetch new revisions.

## Verification checklist
- The latest version's rendered cards match the live wiki cards visually. Compare against `https://deadlock.wiki/Celeste` (the Abilities section).
- The first version shows the release values (Light Eater 20% / 50 / 12s) and the latest shows 18% / 40 / 8s.
- Clicking T1, T2 and T3 on each ability changes values and text the same way as on the wiki, on both sides independently, and turning tiers off reverts.
- Picking identical versions on both sides gives zero highlights.
- Every highlighted value corresponds to an actual difference in the rendered text; spot-check against the raw JSON diff and the Celeste/Update history page.
- No "Lua error" text in any rendered version; no external requests at runtime.
- Test the dropdowns across all 22 versions and a narrow viewport.

## Known limits / caveats
- Celeste only. The same method works for other heroes by changing `hero_name` and the hero key.
- Cards use the current `Data:ResourceLookup.json` and `Data:Dictionary` (labels and icons), so a renamed label shows its current name on old versions.
- Only bot revisions are used, so versions are per game patch, not per individual wiki edit.
- The static page doesn't update itself when the wiki changes; rerun the script for new patches.
