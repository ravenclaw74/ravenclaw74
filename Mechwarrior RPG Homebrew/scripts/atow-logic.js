/**
 * Mechwarrior RPG Homebrew — entry point.
 * Registers the ATOW character sheet, the item sheet, shared partials and sync hooks.
 * NPC and Troop sheets live in atow-npc-logic.js / atow-troop-logic.js.
 */
import { MODULE_ID } from "./lib/rules.js";
import { ATOWBaseSheet, registerSyncHooks } from "./lib/base-sheet.js";
import { ATOWItemSheet } from "./lib/item-sheet.js";
import { itemCategory } from "./lib/slots.js";
import { registerCombatAutomation, applyAttackDamage } from "./lib/combat.js";
import * as rules from "./lib/rules.js";
import * as rolls from "./lib/rolls.js";

export class ATOWActorSheet extends ATOWBaseSheet {
  static layoutKey = "character";

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["atow", "sheet", "actor", "atow-pc-sheet"],
      template: `modules/${MODULE_ID}/templates/atow-sheet.html`
    });
  }
}

/** Register a sheet using the v13+ API. Scope "worldbuilding" keeps existing actors' sheet choice. */
export function registerActorSheet(cls, options) {
  const DSC = foundry.applications?.apps?.DocumentSheetConfig;
  if (DSC?.registerSheet) DSC.registerSheet(Actor, "worldbuilding", cls, options);
  else Actors.registerSheet("worldbuilding", cls, options);
}

Hooks.once("init", async () => {
  registerActorSheet(ATOWActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "A Time of War RPG Sheet"
  });

  const DSC = foundry.applications?.apps?.DocumentSheetConfig;
  const itemOpts = { types: ["item"], makeDefault: true, label: "ATOW Item Sheet" };
  if (DSC?.registerSheet) DSC.registerSheet(Item, "worldbuilding", ATOWItemSheet, itemOpts);
  else Items.registerSheet("worldbuilding", ATOWItemSheet, itemOpts);

  const load = foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  const p = `modules/${MODULE_ID}/templates/partials`;
  await load({
    "atow-slot-table": `${p}/slot-table.hbs`,
    "atow-attributes": `${p}/attributes.hbs`,
    "atow-movement": `${p}/movement.hbs`,
    "atow-combat-data": `${p}/combat-data.hbs`
  });

  registerSyncHooks();
  registerCombatAutomation();

  // Small public API for macros: game.modules.get("mechwarrior-rpg-homebrew").api
  game.modules.get(MODULE_ID).api = { rules, rolls, itemCategory, applyAttackDamage };
});

/** Warn if the module is enabled outside Simple Worldbuilding. */
Hooks.once("ready", () => {
  if (game.system.id !== "worldbuilding") {
    ui.notifications.warn("Mechwarrior RPG Homebrew is built for the Simple Worldbuilding system; sheets may not work in other systems.");
  }
});
