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
            strCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.RryBPfe5LNiWFVvz]{STR}",
            bodCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cJvagGzwyEVc3gii]{BOD}",
            rflCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.SvQXpqJ4atrnd6RU]{RFL}",
            dexCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.ufLn7S7Rx14zrrl6]{DEX}",
            intCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.zjgpiP8mBcXrb8C4]{INT}",
            wilCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.0WhvAiJh3NgtVQWl]{WIL}",
            chaCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.ZxDLnubpdajNNQfn]{CHA}",
            edgCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.BwMHpLJNMQWpbeTx]{EDG}",

            // Attribute Rolls
            dualAttr: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.FYoIfLh4De5ptjOt]{Dual Attribute Roll}",
            opposedAttr: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.cztQJHa3Ft2x0FAT]{Opposed Attribute Roll}",

            // Secondary Characteristics & Skills
            edgeSave: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.RB3Vr6fC0wYNvDHl]{Edge Save}",
            wealthCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.c7vJUYnhZWKCnvyn]{Wealth Check}",
            skillCheck: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.2pFTD0VbxbwyB9Bj]{Skill Check}",
            opposedSkill: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.UpbfgDQuMZXMyxT7]{Opposed Skill Check}",
            bundledSkill: "@UUID[Compendium.mechwarrior-rpg-homebrew.atow-checks.Macro.spAIsYVtCsT52irc]{Bundled Skill Check}",

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