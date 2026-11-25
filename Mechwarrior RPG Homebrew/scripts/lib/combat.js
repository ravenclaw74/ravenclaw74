/**
 * Combat automation:
 *  - Attack damage from the Melee/Ranged Attack macros goes onto the targeted token's
 *    Standard Damage (Fatigue Damage for Subduing weapons). Players' hits on tokens they
 *    don't own are applied by the GM's client over the module socket.
 *  - The Combat Tracker's initiative buttons open the ATOW Initiative dialog for actors on
 *    an ATOW sheet; other actors keep the Simple Worldbuilding roll.
 */
import { MODULE_ID, toInt } from "./rules.js";
import { findSkillRow, resolveSkill } from "./rolls.js";

const SOCKET = `module.${MODULE_ID}`;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/* -------------------------------------------- */
/*  Attack context                              */
/* -------------------------------------------- */

/** Set by openAttackDialog while its roll callback runs: who is attacking, with what. */
let attackContext = null;

export async function withAttackContext(ctx, fn) {
  attackContext = ctx;
  try { return await fn(); }
  finally { attackContext = null; }
}

export const isSubduing = weapon =>
  /subdu/i.test(`${weapon?.notes ?? ""} ${weapon?.special ?? ""}`);

function attackerToken() {
  const actor = attackContext?.actor;
  if (actor) return actor.token?.object ?? actor.getActiveTokens?.()[0] ?? null;
  return canvas?.tokens?.controlled?.[0] ?? null;
}

function attackerActor() {
  return attackContext?.actor ?? attackerToken()?.actor ?? game.user.character ?? null;
}

/** Wound-effect extras written by the Ranged macro: "... Fatigue Damage: 4" / "... Standard Damage: 3". */
function extrasFromText(text) {
  const t = String(text ?? "");
  return {
    fatigue: toInt(t.match(/Fatigue Damage:\s*(\d+)/)?.[1]) ?? 0,
    standard: toInt(t.match(/Standard Damage:\s*(\d+)/)?.[1]) ?? 0
  };
}

/**
 * Called by the attack macros once damage is known.
 * @param {object} o
 * @param {number} o.damage          final damage after the hit location multiplier
 * @param {"attacker"|"defender"} [o.winner]  melee: who won the opposed roll (default attacker)
 * @param {number} [o.extraStandard] wound-effect Standard damage (Internal Damage)
 * @param {number} [o.extraFatigue]  wound-effect Fatigue damage (Dazed)
 * @param {string} [o.effects]       ranged macro's wound-effect text (extras parsed from it)
 */
export async function applyAttackDamage({ damage = 0, winner = "attacker", extraStandard = 0, extraFatigue = 0, effects = "" } = {}) {
  const parsed = extrasFromText(effects);
  extraStandard += parsed.standard;
  extraFatigue += parsed.fatigue;

  const target = [...(game.user.targets ?? [])][0] ?? null;
  const attacker = attackerActor();
  const weapon = winner === "defender" ? null : attackContext?.weapon ?? null;

  // Melee: the defender won and hit back, so the attacker takes the damage
  let receiver, source;
  if (winner === "defender") {
    receiver = attackerToken() ?? attacker;
    source = target?.actor ?? null;
  } else {
    receiver = target;
    source = attacker;
  }
  if (!receiver) {
    ui.notifications.info("No target selected: damage not applied. Target a token (T) before attacking.");
    return null;
  }

  const subduing = isSubduing(weapon);
  const dmg = Math.max(toInt(damage) ?? 0, 0);
  const add = {
    standard: (subduing ? 0 : dmg) + Math.max(extraStandard, 0),
    fatigue: (subduing ? dmg : 0) + Math.max(extraFatigue, 0)
  };
  if (!add.standard && !add.fatigue) return null;

  const uuid = receiver.document?.uuid ?? receiver.uuid;
  const payload = { uuid, add, source: source?.name ?? "", weapon: weapon?.name ?? "", subduing };
  if (resolveActor(uuid)?.isOwner) return applyDamage(payload);
  if (!game.users.activeGM) {
    ui.notifications.warn("No GM is connected to apply damage to that token.");
    return null;
  }
  game.socket.emit(SOCKET, { action: "applyDamage", payload });
  return payload;
}

function resolveActor(uuid) {
  const doc = fromUuidSync(uuid);
  return doc?.actor ?? (doc instanceof Actor ? doc : null);
}

async function applyDamage({ uuid, add, source, weapon, subduing }) {
  const actor = resolveActor(uuid);
  if (!actor) return null;
  const dmg = actor.system?.combat?.damage ?? {};
  const standard = (toInt(dmg.standard) ?? 0) + add.standard;
  const fatigue = (toInt(dmg.fatigue) ?? 0) + add.fatigue;
  await actor.update({ "system.combat.damage.standard": standard, "system.combat.damage.fatigue": fatigue });

  const bod = toInt(actor.system?.attributes?.bod?.value);
  const wil = toInt(actor.system?.attributes?.wil?.value);
  const cap = (v, max) => (max ? `${v} / ${max * 2}` : `${v}`);
  const parts = [];
  if (add.standard) parts.push(`<strong>${add.standard}</strong> Standard`);
  if (add.fatigue) parts.push(`<strong>${add.fatigue}</strong> Fatigue${subduing ? " (Subduing)" : ""}`);
  const notes = [];
  if (bod && standard >= bod * 2) notes.push("Standard Damage at or above capacity.");
  if (wil && fatigue >= wil * 2) notes.push("Fatigue Damage at or above capacity.");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="atow-card"><h3>${esc(actor.name)} takes damage</h3>
      <p>${parts.join(" + ")}${source ? ` from ${esc(source)}` : ""}${weapon ? ` (${esc(weapon)})` : ""}.</p>
      <p>Standard ${cap(standard, bod)} · Fatigue ${cap(fatigue, wil)}</p>
      ${notes.map(n => `<p class="atow-note">${n}</p>`).join("")}</div>`
  });
  return { actor, standard, fatigue };
}

/* -------------------------------------------- */
/*  Initiative                                  */
/* -------------------------------------------- */

const usesAtowSheet = actor => !!actor && String(actor.sheet?.constructor?.name ?? "").startsWith("ATOW");

const hasTrait = (actor, name) =>
  Object.values(actor.system?.traits ?? {}).some(t => String(t?.name ?? "").toLowerCase().startsWith(name));

const skillLevel = (actor, name) => {
  const row = findSkillRow(actor, name);
  return row ? (resolveSkill(actor, row).level ?? 0) : 0;
};

/** ATOW Initiative dialog for one combatant (same options as the Initiative macro). */
async function promptInitiative(combatant) {
  const actor = combatant.actor;
  const type = hasTrait(actor, "combat sense") ? "3d6kh2" : hasTrait(actor, "combat paralysis") ? "3d6kl2" : "2d6";
  const opt = (v, label) => `<option value="${v}" ${v === type ? "selected" : ""}>${label}</option>`;
  const content = `<p><strong>${esc(combatant.name)}</strong></p>
    <div class="form-group"><label>Initiative Type</label><select name="formula">
      ${opt("2d6", "Basic (2d6)")}${opt("3d6kl2", "Combat Paralysis (3d6, lowest 2)")}${opt("3d6kh2", "Combat Sense (3d6, highest 2)")}
    </select></div>
    <div class="form-group"><label>Tactics Skill</label><input type="number" name="tactics" value="${skillLevel(actor, "Tactics")}"></div>
    <div class="form-group"><label>Leadership Skill</label><input type="number" name="leadership" value="${skillLevel(actor, "Leadership")}"></div>
    <div class="form-group"><label>Other modifier</label><input type="number" name="mod" value="0"></div>`;
  return foundry.applications.api.DialogV2.prompt({
    window: { title: "Initiative Roll" },
    content,
    rejectClose: false,
    ok: {
      label: "Roll", icon: "fas fa-dice",
      callback: (event, button) => {
        const f = button.form.elements;
        return { formula: f.formula.value, tactics: toInt(f.tactics.value) ?? 0, leadership: toInt(f.leadership.value) ?? 0, mod: toInt(f.mod.value) ?? 0 };
      }
    }
  });
}

/** Roll ATOW initiative for one combatant; returns the update, or null if cancelled. */
async function rollAtowInitiative(combatant, { messageMode } = {}) {
  const r = await promptInitiative(combatant);
  if (!r) return null;
  const roll = await new Roll(`${r.formula} + @tactics + @leadership + @mod`, r).evaluate();
  const label = { "2d6": "Basic", "3d6kl2": "Combat Paralysis", "3d6kh2": "Combat Sense" }[r.formula];
  // Hidden combatants roll privately, as core does
  const mode = messageMode ?? (combatant.hidden ? "gm" : undefined);
  const opts = game.release.generation >= 14 ? { messageMode: mode } : { rollMode: mode ? "gmroll" : undefined };
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: combatant.token, alias: combatant.name }),
    flavor: `Initiative Roll (${label})`,
    flags: { core: { initiativeRoll: true } }
  }, opts);
  return { _id: combatant.id, initiative: roll.total };
}

function patchInitiative() {
  const proto = CONFIG.Combat.documentClass.prototype;
  const original = proto.rollInitiative;
  proto.rollInitiative = async function (ids, options = {}) {
    ids = typeof ids === "string" ? [ids] : [...ids];
    const atow = [], other = [];
    for (const id of ids) {
      const c = this.combatants.get(id);
      // A formula passed by the caller (another module) wins over the ATOW dialog
      (!options.formula && c?.isOwner && usesAtowSheet(c.actor) ? atow : other).push(id);
    }
    const updates = [];
    for (const id of atow) {
      const u = await rollAtowInitiative(this.combatants.get(id), options);
      if (u) updates.push(u);
    }
    if (updates.length) {
      const updateOptions = { turnEvents: false };
      if (options.updateTurn === false) updateOptions.combatTurn = this.turn;
      await this.updateEmbeddedDocuments("Combatant", updates, updateOptions);
    }
    if (other.length) return original.call(this, other, options);
    return this;
  };
  // Combatant#rollInitiative (used by some macros/modules) skips Combat#rollInitiative
  const cProto = CONFIG.Combatant.documentClass.prototype;
  const originalC = cProto.rollInitiative;
  cProto.rollInitiative = async function (formula) {
    if (!formula && this.combat && usesAtowSheet(this.actor)) return this.combat.rollInitiative([this.id]);
    return originalC.call(this, formula);
  };
}

/* -------------------------------------------- */

export function registerCombatAutomation() {
  Hooks.once("setup", patchInitiative);
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, data => {
      if (data?.action !== "applyDamage") return;
      if (game.user !== game.users.activeGM) return;
      applyDamage(data.payload);
    });
  });
}
