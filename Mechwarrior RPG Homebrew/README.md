# Mechwarrior RPG Homebrew

A Time of War / MechWarrior Destiny for Foundry VTT v13–v14. Requires the **Simple Worldbuilding** system.

## Install

1. Download `mechwarrior-rpg-homebrew.zip` from the latest **Release**.
2. Close Foundry. Unzip into `Data/modules`, giving `Data/modules/mechwarrior-rpg-homebrew/module.json`.
   (Windows: `%LOCALAPPDATA%\FoundryVTT\Data\modules`)
3. Start Foundry, create a Simple Worldbuilding world, enable the module.

**Update:** delete the old folder, unzip the new release. Worlds and characters are unaffected.

## Use

- New *character* actors open on the ATOW sheet. For NPCs/troops: *Sheet ▸ This Sheet ▸ ATOW NPC / Troop Sheet*.
- Drag items from the **ATOW Items** compendium onto a sheet:

| Section | Accepts |
| --- | --- |
| Traits/Skills | Trait, Skill |
| Combat | Armor, Weapon (equipped) |
| Other | Armor, Weapon, Equipment (carried) |

Wrong item types are rejected with a warning. Rows fill in automatically and stay linked to the item: 📖 opens it, ✕ removes it.

- 🎲 rolls a skill; attribute buttons roll checks. Shift-click adds modifiers.
- ⌖ opens the Melee or Ranged Attack dialog with your side filled in (skill, link, BD/AP); ranged shots use ammo. Shift-click: quick roll.
- **Damage:** target a token (T), then attack with ⌖ or the Melee/Ranged Attack macros. Damage goes onto the target's Standard Damage (Fatigue for Subduing weapons). If the defender wins a melee roll, the attacker takes it.
- **Initiative:** Combat Tracker roll buttons open the ATOW Initiative dialog (Combat Sense/Paralysis, Tactics, Leadership prefilled). Non-ATOW actors use the system roll.
- XP entries set attribute scores, skill levels and trait points. **Auto** fills movement. Martial Arts BD = STR ÷ 4, rounded up.

**Limits**

- Damage on tokens you don't own needs a GM connected.
- Unlinked tokens (mooks) take damage on the token, not the actor.
- Subduing is only detected for attacks started from ⌖; hotbar macros don't know the weapon.
- Shift-click quick rolls don't apply damage. Basic Melee/Ranged macros do, without hit location.
- Non-ATOW initiative uses the world's system formula.

## Compendiums

| Pack | Contents |
| --- | --- |
| ATOW Items | 262 skills, traits, weapons, armour, equipment |
| ATOW NPCs & Pregens | 42 ready-made characters |
| ATOW Actors | Blank sheets |
| ATOW / MWD Checks, Tables; CBT/AS Tables | Roll macros and tables |
| ATOW / MWD Rulebooks | Links to your own PDFs (not included): upload them and edit each page's path |

## Development

Pack sources are in `src/packs/*.json`. With Foundry closed:

```
node tools/build-packs.mjs     # JSON -> packs
node tools/extract-packs.mjs   # packs -> JSON
```

Rule numbers are in `scripts/lib/rules.js`.

Manifest URL: "https://raw.githubusercontent.com/ravenclaw74/ravenclaw74/main/Mechwarrior%20RPG%20Homebrew/module.json"
