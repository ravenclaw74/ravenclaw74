import { MODULE_ID } from "./lib/rules.js";
import { ATOWBaseSheet } from "./lib/base-sheet.js";
import { registerActorSheet } from "./atow-logic.js";

export class ATOWTroopSheet extends ATOWBaseSheet {
  static layoutKey = "troop";

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["atow", "sheet", "actor", "npc", "atow-troop-sheet"],
      template: `modules/${MODULE_ID}/templates/atow-troop-sheet.html`,
      tabs: []
    });
  }
}

Hooks.once("init", () => {
  registerActorSheet(ATOWTroopSheet, {
    types: ["character", "npc"],
    makeDefault: false,
    label: "ATOW Troop Sheet"
  });
});
