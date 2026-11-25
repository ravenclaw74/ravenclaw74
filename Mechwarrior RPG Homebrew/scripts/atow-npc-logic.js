import { MODULE_ID } from "./lib/rules.js";
import { ATOWBaseSheet } from "./lib/base-sheet.js";
import { registerActorSheet } from "./atow-logic.js";

export class ATOWNPCSheet extends ATOWBaseSheet {
  static layoutKey = "npc";

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["atow", "sheet", "actor", "npc", "atow-npc-sheet"],
      template: `modules/${MODULE_ID}/templates/atow-npc-sheet.html`
    });
  }
}

Hooks.once("init", () => {
  registerActorSheet(ATOWNPCSheet, {
    types: ["character", "npc"],
    makeDefault: false,
    label: "ATOW NPC Sheet"
  });
});
