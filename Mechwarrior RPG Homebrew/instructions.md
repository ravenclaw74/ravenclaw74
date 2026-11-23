# MechWarrior RPG Homebrew Module — Update Instructions

## Overview

This document outlines the technical specifications for updating the **`mechwarrior-rpg-homebrew`** Foundry VTT module (`module.json`). Based on the module's file structure (`scripts/atow-logic.js`, `scripts/atow-npc-logic.js`, `scripts/atow-troop-logic.js`, and the `atow-*` compendium packs), the goal is to implement section-specific drag-and-drop functionality for `Item` documents onto the A Time of War (ATOW) Character Sheet (and applicable NPC/Troop sheets), automatically filtering items by section and populating the existing column statistics.

---

## 1. Module Architecture & Target Files

### 1.1 Relevant Module Files
* **Manifest:** `module.json` (verify `esmodules` / `scripts` paths; note that duplicate nested `scripts/` directories exist in the archive and should be kept clean during updates).
* **Character Sheet Logic:** `scripts/atow-logic.js` (and `scripts/atow-npc-logic.js` / `scripts/atow-troop-logic.js` if shared sheet rendering or drop logic applies).
* **Icons & Assets:** `icons/armour.png`, `icons/weapon.png`, `icons/equipment.png` (available for default fallback icons if dropped items lack custom artwork).

### 1.2 Hook / Sheet Event Interception
* Since `mechwarrior-rpg-homebrew` operates as a **module** (rather than a standalone game system, likely built on top of `worldbuilding`, `custom-system-builder`, or a base system), inspect `scripts/atow-logic.js` to determine how the character sheet is rendered or extended:
  * **If extending a custom `ActorSheet` / `ApplicationV2` class:** Override `_onDropItem(event, data)` (or the V2 drop handler) directly in `scripts/atow-logic.js`.
  * **If hooking into an existing system's sheet (`Hooks.on("renderActorSheet", ...)`):** Bind native HTML5 `dragover` and `drop` event listeners (`html.find(...)` or `element.querySelectorAll(...)`) onto the specific section containers inside `scripts/atow-logic.js`, intercepting `TextEditor.getDragEventData(event)` before the parent sheet's default drop handler processes the item.

---

## 2. Section-Specific Drag-and-Drop Rules

Configure the three target sections on the character sheet with distinct drop-zone identifiers (e.g., `data-drop-section="traits-skills"`, `data-drop-section="combat"`, `data-drop-section="other"`).

| Character Sheet Section | Drop Zone Identifier | Accepted Item Types / Categories | Invalid Drop Behavior |
| :--- | :--- | :--- | :--- |
| **Traits / Skills** | `data-drop-section="traits-skills"` | Individual **Trait** and **Skill** items | Prevent default drop & trigger `ui.notifications.warn(...)` |
| **Combat** | `data-drop-section="combat"` | Individual **Armor** and **Weapon** items | Prevent default drop & trigger `ui.notifications.warn(...)` |
| **Other** | `data-drop-section="other"` | Individual **Armor**, **Weapon**, and **Equipment** items | Prevent default drop & trigger `ui.notifications.warn(...)` |

*(Note: Verify whether the base system distinguishes items via `item.type`—e.g., `"trait"`, `"skill"`, `"armor"`, `"weapon"`, `"equipment"`—or via a custom property/tag inside `item.system` or `item.flags`, and match the validation check accordingly.)*

---

## 3. Section Requirements & Automatic Stat Population

### 3.1 Traits / Skills Section
* **Allowed Drops:** Individual **Trait** and **Skill** items (dragged from the Items directory or `atow-*` compendium packs).
* **Auto-Population Behavior:**
  * On drop, extract the source `Item` document via `await Item.implementation.fromDropData(data)`.
  * Create the embedded item on the target Actor (`actor.createEmbeddedDocuments("Item", [itemData])`) or append a new row to the sheet's Traits/Skills table if the sheet uses table-row data structures.
  * **Automatically populate all existing columns** in the Traits/Skills section using the dropped item's properties (e.g., **Name**, **Linked Attribute**, **Target Number / TN**, **Level / Rank**, **XP / TP Cost**, **Modifiers**).
  * Trigger any dependent skill/attribute recalculations defined in `scripts/atow-logic.js`.

### 3.2 Combat Section
* **Allowed Drops:** Individual **Armor** and **Weapon** items.
* **Auto-Population Behavior:**
  * On drop, validate that the item is an **Armor** or **Weapon**.
  * Create the embedded item on the Actor and mark it as assigned to the Combat section (e.g., setting `system.equipped = true` or a module flag `flags["mechwarrior-rpg-homebrew"].section = "combat"`) so it renders in **Combat** rather than **Other**.
  * **Automatically populate all existing columns** in the Combat section from the dropped item's stats:
    * **Weapons:** Name, Associated Skill, Damage / AP, Range (Short / Medium / Long / Extreme), Shots / Ammo, Recoil, Mass / Weight, etc.
    * **Armor:** Name, Hit Locations Covered, BAR (Ballistic/Energy/Melee/Explosive Armor Ratings), Encumbrance / Penalties, Mass / Weight, etc.

### 3.3 Other Section
* **Allowed Drops:** Individual **Armor**, **Weapon**, and **Equipment** items.
* **Auto-Population Behavior:**
  * On drop, validate that the item is an **Armor**, **Weapon**, or **Equipment** item.
  * Create the embedded item on the Actor and mark it as assigned to the Other section (e.g., `system.equipped = false` or `flags["mechwarrior-rpg-homebrew"].section = "other"`).
  * **Automatically populate all existing columns** in the Other section using the item's stats (e.g., **Name**, **Category / Type**, **Quantity**, **Mass / Weight**, **Cost / C-Bills**, **Notes / Effect**).

---

## 4. UI Feedback & Data Synchronization

1. **Visual Drop Indicators:**
   * Add CSS styling (e.g., `.mwrpg-drop-zone.drag-over`) to the **Traits/Skills**, **Combat**, and **Other** containers in `scripts/atow-logic.js` (and the module's stylesheet) so valid target sections highlight when a user drags an item over them.
2. **Prevent Duplicate / Double-Creation:**
   * When intercepting a drop event in a custom listener inside `scripts/atow-logic.js`, call `event.preventDefault()` and `event.stopPropagation()` so the underlying base system does not also create a duplicate unrouted copy of the item.
3. **Immediate Sheet Refresh:**
   * Ensure `sheet.render(false)` runs after item creation and stat mapping so the newly populated row and column values appear immediately.
4. **Two-Way Stat Editing:**
   * Confirm that editing any auto-populated stat cell directly on the character sheet updates the underlying embedded `Item` document (`item.update({ ... })`) so item data stays in sync.

---

## 5. Implementation Checklist

* [ ] Inspect `scripts/atow-logic.js` (and `module.json`) to confirm how the character sheet template, item schemas, and existing column inputs are structured.
* [ ] Add `data-drop-section` attributes (`"traits-skills"`, `"combat"`, `"other"`) and `dragover`/`dragleave`/`drop` handlers to the three sheet sections.
* [ ] Implement strict item-type validation per section with `ui.notifications.warn()` feedback for invalid drops.
* [ ] Map all dropped `Item` properties (`trait`, `skill`, `armor`, `weapon`, `equipment`) directly into the existing column fields of each respective section upon drop.
* [ ] Verify whether `scripts/atow-npc-logic.js` and `scripts/atow-troop-logic.js` share the same sheet layout and apply the drop handlers there if applicable.
* [ ] Clean up any redundant nested `scripts/` assets if needed and test drag-and-drop from both the World Items sidebar and `packs/` compendiums.