// Modernise compendium macro code for Foundry v13/v14 (idempotent; safe to re-run).
//  - The Roll#roll({async}) / Roll#evaluate({async}) option was removed: use `await roll.evaluate()`.
//    NOTE: Roll#evaluateSync cannot roll dice; with strict:false it silently scores every die as 0,
//    so un-awaited rolls are converted to awaited ones and their callbacks/helpers made async.
//  - Hit Location Table lookups fall back to the module compendium (no world import needed).
//  - Dice So Nice calls become optional.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = `(game.tables.getName("Hit Location Table") ?? (await game.packs.get("mechwarrior-rpg-homebrew.atow-tables")?.getDocuments({ name: "Hit Location Table" }))?.[0])`;

export function patch(c) {
  // awaited legacy forms -> evaluate()
  c = c.replace(/await\s+([\w.\[\]()"'`$ +@{}-]+?)\.roll\(\{\s*async:\s*(?:true|false)\s*\}\)/g, "await $1.evaluate()");
  // un-awaited statements -> awaited evaluate()
  c = c.replace(/^(\s*)(\w+)\.roll\(\{\s*async:\s*(?:true|false)\s*\}\);/gm, "$1await $2.evaluate();");
  c = c.replace(/^(\s*)(\w+)\.evaluateSync\(\{\s*strict:\s*false\s*\}\);/gm, "$1await $2.evaluate();");
  c = c.replace(/new Roll\(("[^"]+")\)\.(?:roll\(\{\s*async:\s*false\s*\}\)|evaluateSync\(\{\s*strict:\s*false\s*\}\))/g, "await new Roll($1).evaluate()");
  c = c.replace(/\.roll\(\{\s*async:\s*true\s*\}\)/g, ".evaluate()");
  c = c.replace(/\.evaluate\(\{\s*async:\s*(?:true|false)\s*\}\)/g, ".evaluate()");
  c = c.replace(/\.toMessage\(\{\s*async:\s*(?:true|false)\s*\}\)/g, ".toMessage()");
  // helpers / callbacks that now contain await must be async
  c = c.replace(/(^|[^\w])function rollDice\(/gm, "$1async function rollDice(");
  c = c.replace(/async async function/g, "async function");
  c = c.replace(/=\s*rollDice\(/g, "= await rollDice(");
  c = c.replace(/callback:\s*\(html\)\s*=>\s*\{/g, "callback: async (html) => {");
  // Dice So Nice is optional
  c = c.replace(/await game\.dice3d\.showForRoll\(/g, "await game.dice3d?.showForRoll(");
  // Ranged attack macros show a Range dropdown but never applied it: add it to the roll
  if (c.includes('name="range"') && !c.includes("rangeModifier")) {
    c = c.replace(/(let additionalModifier = parseInt\(html\.find\('\[name="additionalModifier"\]'\)\.val\(\)\);)/,
      `$1\n        let rangeModifier = parseInt(html.find('[name="range"]').val()) || 0;`);
    c = c.replace(/(\+ @additionalModifier)"/g, '$1 + @rangeModifier"');
    c = c.replace(/additionalModifier: additionalModifier\}/g, "additionalModifier: additionalModifier, rangeModifier: rangeModifier}");
  }
  // Melee macro rolled hit location on 1d6 against an 11-entry list, so legs, hands and feet
  // could never be hit. Use the same 2d6 ATOW Hit Location Table as the ranged macro
  // (Torso -> 1d6 Chest 1-4 / Abdomen 5-6; Legs -> 1d6 Left 1-3 / Right 4-6).
  if (c.includes("hitLocationRoll === 11 ? \"rightFoot\"") && !c.includes("rollMeleeHitLocation")) {
    c = c.replace(/let hitLocationRoll = await roll1d6\(\);\s*\n\s*let hitLocation = hitLocationRoll === 1 \? "head"[^\n]*"unknown";/g,
      "let hitLocation = await rollMeleeHitLocation();");
    c = c.replace(/(\/\/ Function to create chat message)/, `// ATOW hit location: 2d6 table, with Torso and Legs split by 1d6
async function rollMeleeHitLocation() {
    const table = {2: "head", 3: "leftFoot", 4: "leftHand", 5: "leftArm", 6: "torso", 7: "legs",
                   8: "torso", 9: "rightArm", 10: "rightHand", 11: "rightFoot", 12: "head"};
    const roll = new Roll("2d6");
    await roll.evaluate();
    await roll.toMessage({flavor: "Hit Location Roll (2d6)", rollMode: "roll"});
    let location = table[roll.total];
    if (location === "torso") location = (await roll1d6()) <= 4 ? "chest" : "abdomen";
    else if (location === "legs") location = (await roll1d6()) <= 3 ? "leftLeg" : "rightLeg";
    return location;
}

$1`);
  }
  // Automated damage: hand the final damage to the module, which applies it to the targeted token
  const API = `game.modules.get("mechwarrior-rpg-homebrew")?.api?.applyAttackDamage`;
  if (c.includes("async function applyDamageAndEffects(hitLocation, damage)") && !c.includes("applyAttackDamage")) {
    c = c.replace("async function applyDamageAndEffects(hitLocation, damage) {", `async function applyDamageAndEffects(hitLocation, damage, winner = "attacker") {\n    let extra = {Standard: 0, Fatigue: 0};`);
    c = c.replace(/(createChatMessage\(`<b>Additional \$\{effect\.damageType\} Damage:<\/b> \$\{additionalDamage\}`\);)/,
      "$1\n            extra[effect.damageType] += additionalDamage;");
    c = c.replace(/(createChatMessage\(`<b>Wound Effect:<\/b>[\s\S]*?\n {4}\}\n)\}/,
      `$1    await ${API}?.({damage: totalDamage, winner, extraStandard: extra.Standard, extraFatigue: extra.Fatigue});\n}`);
    c = c.replace("await applyDamageAndEffects(hitLocation, damage);", `await applyDamageAndEffects(hitLocation, damage, "attacker");`);
    c = c.replace("await applyDamageAndEffects(hitLocation, damage);", `await applyDamageAndEffects(hitLocation, damage, "defender");`);
  }
  if (c.includes("<b>Final Damage after Multiplier:</b>") && !c.includes("applyAttackDamage")) {
    c = c.replace(/(<b>Wound Effects:<\/b> \$\{woundEffects\}\s*`\s*\}\);)/,
      `$1\n          await ${API}?.({damage: finalDamage, effects: woundEffects});`);
  }
  // Basic Melee / Basic Ranged macros: same hand-off (no hit location in these)
  if (c.includes("damage_char1 = Math.max(0,") && !c.includes("applyAttackDamage")) {
    c = c.replace(/(ChatMessage\.create\(\{\s*speaker: ChatMessage\.getSpeaker\(\),\s*content: content\s*\}\);)/,
      `$1\n        if (damage_char1 > 0) await ${API}?.({damage: damage_char1});\n        else if (damage_char2 > 0) await ${API}?.({damage: damage_char2, winner: "defender"});`);
  }
  if (c.includes("<br>Final Damage: ${finalDamage}`") && !c.includes("applyAttackDamage")) {
    c = c.replace(/(<br>Final Damage: \$\{finalDamage\}`\s*\}\);)/,
      `$1\n        if (finalDamage > 0) await ${API}?.({damage: finalDamage});`);
  }
  // Initiative macro: put the result into the Combat Tracker for the selected token's combatant
  if (c.includes('flavor: `Initiative Roll (${rollDescription})`') && !c.includes("setInitiative")) {
    c = c.replace(/(roll\.toMessage\(\{\s*speaker: ChatMessage\.getSpeaker\(\),\s*flavor: `Initiative Roll \(\$\{rollDescription\}\)`\s*\}\);)/,
      `$1\n\n                // Add the result to the Combat Tracker (selected token, else your character)\n                const setInitiative = game.combat?.combatants.find(c => c.tokenId === canvas.tokens.controlled[0]?.id)\n                    ?? game.combat?.combatants.find(c => c.actorId === game.user.character?.id);\n                if (setInitiative) await game.combat.setInitiative(setInitiative.id, roll.total);`);
  }
  // Hit location table: world table if imported, otherwise the module compendium
  c = c.replace(/game\.tables\.getName\("Hit Location Table"\)(?!\s*\?\?)/g, TABLE);
  return c;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let changed = 0;
  for (const file of fs.readdirSync(path.join(root, "src", "packs"))) {
    const p = path.join(root, "src", "packs", file);
    const rows = JSON.parse(fs.readFileSync(p, "utf8"));
    let dirty = false;
    for (const r of rows) {
      if (typeof r.command !== "string") continue;
      const c = patch(r.command);
      if (c !== r.command) { r.command = c; dirty = true; changed++; console.log(`patched ${file} :: ${r.name}`); }
    }
    if (dirty) fs.writeFileSync(p, JSON.stringify(rows, null, 1) + "\n");
  }
  console.log(`${changed} macros patched`);
}
