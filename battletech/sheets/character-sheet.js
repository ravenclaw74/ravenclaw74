class BattletechCharacterSheet extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["battletech", "sheet", "character"],
      template: "systems/battletech/templates/character-sheet.html",
      width: 600,
      height: 600,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes"}]
    });
  }

  getData() {
    const data = super.getData();
    // Additional processing of data if necessary
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Add any event listeners here
  }
}

Actors.registerSheet("battletech", BattletechCharacterSheet, {makeDefault: true});
