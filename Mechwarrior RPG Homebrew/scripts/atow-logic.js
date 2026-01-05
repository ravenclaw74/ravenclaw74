export class ATOWActorSheet extends ActorSheet {
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["atow", "sheet", "actor"],
            template: "modules/mechwarrior-rpg-homebrew/templates/atow-sheet.html",
            width: 850,
            height: 950,
            resizable: true
        });
    }

    /** @override */
    async getData() {
        const context = super.getData();
        context.system = this.actor.system;

        // Map of all hardcoded macros used in the sheet
        const macroMapping = {
            // Attribute Checks
            strCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.Dd0KYP6rTNQSYiV8]{STR}",
            bodCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.Dd0KYP6rTNQSYiV8]{BOD}",
            rflCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.Dd0KYP6rTNQSYiV8]{RFL}",
            dexCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.Dd0KYP6rTNQSYiV8]{DEX}",
            intCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.Dd0KYP6rTNQSYiV8]{INT}",
            wilCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.Dd0KYP6rTNQSYiV8]{WIL}",
            chaCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.Dd0KYP6rTNQSYiV8]{CHA}",
            edgCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.Dd0KYP6rTNQSYiV8]{EDG}",

            // Opposed Attribute Rolls
            opposedStr: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed STR}",
            opposedBod: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed BOD}",
            opposedRfl: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed RFL}",
            opposedDex: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed DEX}",
            opposedInt: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed INT}",
            opposedWil: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed WIL}",
            opposedCha: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed CHA}",
            opposedEdg: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed EDG}",

            // Secondary Characteristics & Skills
            edgeSave: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.RB3Vr6fC0wYNvDHl]{Edge Save}",
            wealthCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.c7vJUYnhZWKCnvyn]{Wealth Check}",
            skillCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.2pFTD0VbxbwyB9Bj]{Skill Check}",
            opposedSkill: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.UpbfgDQuMZXMyxT7]{Opposed Skill Check}",

            // Combat Data
            initiative: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.1ZklyZtLbpmnnBHq]{Initiative}",
            meleeAttack: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.jvSmI206CbLA9J8z]{Melee Attack}",
            rangedAttack: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.kc4pta6eq8PTf3Ye]{Ranged Attack}"
        };

        // Enrich all macros in the mapping
        context.enrichedMacros = {};
        for (let [key, uuid] of Object.entries(macroMapping)) {
            context.enrichedMacros[key] = await TextEditor.enrichHTML(uuid, { async: true });
        }

        return context;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Save data from contenteditable fields
        html.find('[contenteditable="true"]').blur(async ev => {
            const element = ev.currentTarget;
            const field = element.getAttribute("name"); 
            const value = element.innerText.trim();
            
            if (field) {
                // Determine if the value should be saved as a number or string
                const updateValue = (value !== "" && !isNaN(value)) ? Number(value) : value;
                await this.actor.update({ [field]: updateValue });
            }
        });
    }
}

Hooks.once("init", () => {
    Actors.registerSheet("worldbuilding", ATOWActorSheet, {
        types: ["character"],
        makeDefault: true,
        label: "A Time of War RPG Sheet"
    });
});