export class ATOWTroopSheet extends ActorSheet {
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["atow", "sheet", "actor", "npc", "atow-troop-sheet"],
            template: "modules/mechwarrior-rpg-homebrew/templates/atow-troop-sheet.html",
            width: 850,
            height: 950,
            resizable: true
        });
    }

    /** @override */
    async getData() {
        const context = super.getData();
        context.system = this.actor.system;

        const macroMapping = {
            dualAttr: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.FYoIfLh4De5ptjOt]{Attribute Roll}",
            opposedAttr: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed Attribute Roll}",
            skillCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.2pFTD0VbxbwyB9Bj]{Skill Check}",
            opposedSkill: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.UpbfgDQuMZXMyxT7]{Opposed Skill Check}",
            initiative: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.1ZklyZtLbpmnnBHq]{Initiative}",
            meleeAttack: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.jvSmI206CbLA9J8z]{Melee Attack}",
            rangedAttack: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.kc4pta6eq8PTf3Ye]{Ranged Attack}"
        };

        context.enrichedMacros = {};
        for (let [key, uuid] of Object.entries(macroMapping)) {
            context.enrichedMacros[key] = await TextEditor.enrichHTML(uuid, { async: true });
        }

        return context;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        html.find('[contenteditable="true"]').blur(async ev => {
            const element = ev.currentTarget;
            const field = element.getAttribute("name"); 
            const value = element.innerText.trim();
            
            if (field) {
                const updateValue = (value !== "" && !isNaN(value)) ? Number(value) : value;
                await this.actor.update({ [field]: updateValue });
            }
        });
    }
}

Hooks.once("init", () => {
    Actors.registerSheet("worldbuilding", ATOWTroopSheet, {
        types: ["character", "npc"],
        makeDefault: false,
        label: "ATOW Troop Sheet"
    });
});