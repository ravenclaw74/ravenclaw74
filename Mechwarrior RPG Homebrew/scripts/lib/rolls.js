/**
 * Automated ATOW rolls driven straight from sheet data.
 * Replaces the "type the numbers into a dialog" flow of the original macros.
 */
import {
  ATTRIBUTE_LABELS, RULES, toInt, linkModifier, formatMod, parseLinks, parseTNC, lookupSkill,
  marginDescription, defaultWeaponSkill, isMelee, esc
} from "./rules.js";
import { withAttackContext } from "./combat.js";

const DialogV2 = () => foundry.applications.api.DialogV2;

/** "2d6 + 4 - 1" from dice and numeric parts, dropping zeros. */
function buildFormula(dice, parts) {
  return parts.filter(n => Number(n)).reduce((f, n) => `${f} ${n < 0 ? "-" : "+"} ${Math.abs(n)}`, dice);
}

const RANGE_LABELS = { pointBlank: "Point Blank", short: "Short", medium: "Medium", long: "Long", extreme: "Extreme" };

/** Sum of the natural (kept) dice, for Fumble / Stunning Success detection. */
function naturalTotal(roll) {
  const die = roll.dice[0];
  if (!die) return null;
  return die.results.filter(r => r.active !== false && !r.discarded).reduce((a, r) => a + r.result, 0);
}

/** Highest total an Action Check's unmodified dice can reach through Stunning Success re-rolls. */
const MAX_UNMODIFIED = 30;

/**
 * Evaluate an ATOW Action Check roll and apply the Fumble / Stunning Success rules.
 *  - Natural (unmodified) 2: Fumble, an automatic failure whatever the modifiers.
 *  - Natural 12: Stunning Success. Roll 1d6 more and add it; while a 6 comes up roll again,
 *    up to an unmodified total of 30. The total plus modifiers is then compared to the TN as normal.
 *  - Unmodified 30: Miraculous Feat, an automatic success.
 * Used by the sheet rolls and (through the module API) by the compendium roll macros, so the
 * rule lives in one place.
 * @param {Roll} roll  a Roll whose first dice term is the check's 2d6 (or 3d6kh2); evaluated here if needed
 */
export async function evaluateActionRoll(roll) {
  if (!roll._evaluated) await roll.evaluate();
  const natural = naturalTotal(roll) ?? 0;
  const extra = [];
  let unmodified = natural;
  if (natural === 12) {
    while (unmodified < MAX_UNMODIFIED) {
      const die = await new Roll("1d6").evaluate();
      extra.push(die.total);
      unmodified += die.total;
      if (die.total < 6) break;
    }
  }
  const fumble = natural === 2;
  const miraculous = unmodified >= MAX_UNMODIFIED;
  const bonus = unmodified - natural;
  const dice = extra.join(", ");
  const text = fumble ? "Fumble! Natural 2: automatic failure (−1 roll modifier to actions in the next 5–10 seconds)."
    : miraculous ? `Miraculous Feat! Stunning Success reached 30 (extra dice: ${dice}): automatic success.`
    : extra.length ? `Stunning Success! Natural 12, extra dice: ${dice} (+${bonus}).` : "";
  return {
    roll, natural, extra, bonus, fumble, miraculous,
    /** Roll total including Stunning Success dice. */
    total: roll.total + bonus,
    /** Margin of Success against a target number, after the Fumble / Miraculous Feat overrides. */
    margin(tn) {
      let m = this.total - tn;
      if (fumble) m = Math.min(m, -1);
      if (miraculous) m = Math.max(m, 0);
      return m;
    },
    /** Chat text for sheet cards. */
    noteBlock: text ? `<div class="atow-note">${text}</div>` : "",
    /** Chat text for the compendium macros, which build their messages with <br>. */
    note: text ? `<br><b>${text.replace(/^([^!]+!)/, "$1</b>")}` : ""
  };
}

/**
 * Action Check dice for the compendium roll macros: 2d6 (or 3d6 keep highest 2 with Natural Aptitude)
 * plus `modifiers`, e.g. rollActionCheck("@skillLevel + @link + @mod", {skillLevel, link, mod}).
 */
export function rollActionCheck(modifiers, data = {}, naturalAptitude = false) {
  return evaluateActionRoll(new Roll(`${naturalAptitude ? "3d6kh2" : "2d6"} + ${modifiers}`, data));
}

function card({ title, subtitle = "", rows = [], result, tn, margin, extra = "" }) {
  const status = margin === null || margin === undefined ? "" :
    `<div class="atow-result ${margin >= 0 ? "success" : "failure"}">${margin >= 0 ? "Success" : "Failure"} — MoS ${formatMod(margin)} · ${esc(marginDescription(margin))}</div>`;
  return `<div class="atow-chat">
    <header><h3>${esc(title)}</h3>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</header>
    <table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("")}
      ${tn !== undefined ? `<tr><th>Target Number</th><td>${tn}</td></tr>` : ""}
      ${result !== undefined ? `<tr><th>Total</th><td><strong>${result}</strong></td></tr>` : ""}
    </table>${status}${extra}</div>`;
}

/**
 * Ask for situational modifiers. Returns {mod, ...extra} or null when cancelled.
 * @param {string} title
 * @param {string} [extraHtml]  extra form fields
 */
export async function promptModifiers(title, extraHtml = "") {
  const result = await DialogV2().prompt({
    window: { title },
    content: `<div class="atow-dialog">${extraHtml}
      <div class="form-group"><label>Additional modifiers</label><input type="number" name="mod" value="0" autofocus></div></div>`,
    ok: {
      label: "Roll",
      callback: (event, button) => Object.fromEntries(new FormData(button.form))
    },
    rejectClose: false
  });
  if (!result) return null;
  result.mod = toInt(result.mod) ?? 0;
  return result;
}

/** Natural Aptitude trait matching a skill ("Natural Aptitude (Gunnery)" / "Natural Aptitude: Small Arms"). */
export function hasNaturalAptitude(actor, skillName) {
  const traits = Object.values(actor.system?.traits ?? {});
  const skill = String(skillName ?? "").toLowerCase();
  return traits.some(t => {
    const n = String(t?.name ?? "").toLowerCase();
    if (!n.startsWith("natural aptitude")) return false;
    const target = n.replace(/^natural aptitude\s*[:(\-]?\s*/, "").replace(/\)\s*$/, "").trim();
    return target && skill.startsWith(target.split(/\s*\(/)[0]);
  });
}

export function attributeScore(actor, key) {
  return toInt(actor.system?.attributes?.[key]?.value) ?? 0;
}

/* -------------------------------------------- */

/**
 * Single attribute check (2d6 + score vs TN 12) or double (two attributes vs TN 18).
 */
export async function rollAttribute(actor, key, { prompt = false, second = null } = {}) {
  let mod = 0;
  if (prompt) {
    const opts = Object.entries(ATTRIBUTE_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
    const r = await promptModifiers(`${ATTRIBUTE_LABELS[key]} Attribute Check`,
      `<div class="form-group"><label>Second attribute (double check)</label><select name="second"><option value="">— single check (TN ${RULES.singleAttributeTN}) —</option>${opts}</select></div>`);
    if (!r) return null;
    mod = r.mod;
    second = r.second || null;
  }
  const a = attributeScore(actor, key);
  const b = second ? attributeScore(actor, second) : 0;
  const tn = second ? RULES.doubleAttributeTN : RULES.singleAttributeTN;
  const check = await evaluateActionRoll(new Roll(buildFormula("2d6", [a, b, mod])));
  const roll = check.roll;
  const margin = check.margin(tn);
  const rows = [[ATTRIBUTE_LABELS[key], a]];
  if (second) rows.push([ATTRIBUTE_LABELS[second], b]);
  if (mod) rows.push(["Modifiers", formatMod(mod)]);
  const label = second ? `${ATTRIBUTE_LABELS[key]} + ${ATTRIBUTE_LABELS[second]}` : ATTRIBUTE_LABELS[key];
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: card({
      title: `${label} Attribute Check`, rows, result: check.total, tn, margin,
      extra: check.noteBlock
    })
  });
}

/**
 * Resolve a skill row into roll numbers. Sheet values win; FG reference data fills gaps.
 * @returns {{name, level, links:string[], linkTotal, tn, complexity}}
 */
export function resolveSkill(actor, row) {
  const ref = lookupSkill(row?.name);
  let links = parseLinks(row?.links);
  if (!links.length && ref) links = ref.links;
  const { tn: sheetTN, complexity: sheetC } = parseTNC(row?.tnc);
  const tn = sheetTN ?? ref?.tn ?? 7;
  const complexity = sheetC || ref?.complexity || "";
  const level = toInt(row?.lvl);
  const linkTotal = links.reduce((sum, k) => sum + linkModifier(actor.system?.attributes?.[k]?.value), 0);
  return { name: row?.name ?? "", level, links, linkTotal, tn, complexity };
}

/** Find a skill row on the actor by name (exact, then prefix). */
export function findSkillRow(actor, name) {
  const want = String(name ?? "").toLowerCase().trim();
  if (!want) return null;
  const rows = Object.values(actor.system?.skills ?? {}).filter(r => r?.name);
  return rows.find(r => r.name.toLowerCase().trim() === want)
    ?? rows.find(r => r.name.toLowerCase().startsWith(want))
    ?? rows.find(r => want.startsWith(r.name.toLowerCase().split(" (")[0].trim()))
    ?? null;
}

/**
 * Skill check: 2d6 (3d6 keep 2 with Natural Aptitude) + level + link modifiers + mods vs TN.
 * Untrained (blank level) uses the ATOW unskilled penalty of -4 on top of links.
 */
export async function rollSkill(actor, row, { prompt = false, extraRows = [], extraMod = 0, title } = {}) {
  const s = resolveSkill(actor, row);
  let mod = extraMod;
  if (prompt) {
    const r = await promptModifiers(`${s.name} Skill Check`);
    if (!r) return null;
    mod += r.mod;
  }
  const trained = s.level !== null;
  const level = trained ? s.level : -4;
  const na = hasNaturalAptitude(actor, s.name);
  const check = await evaluateActionRoll(new Roll(buildFormula(na ? "3d6kh2" : "2d6", [level, s.linkTotal, mod])));
  const roll = check.roll;
  const margin = check.margin(s.tn);
  const rows = [
    ["Skill level", trained ? s.level : "Untrained (−4)"],
    ["Links", s.links.length ? `${s.links.map(k => `${ATTRIBUTE_LABELS[k]} ${formatMod(linkModifier(actor.system?.attributes?.[k]?.value))}`).join(", ")}` : "—"],
    ...extraRows
  ];
  if (mod) rows.push(["Modifiers", formatMod(mod)]);
  if (na) rows.push(["Natural Aptitude", "3d6, keep highest 2"]);
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: card({
      title: title ?? `${s.name} Check`, subtitle: s.complexity ? `TN ${s.tn} / ${s.complexity}` : "",
      rows, result: check.total, tn: s.tn, margin,
      extra: check.noteBlock
    })
  });
  return { roll, margin, success: margin >= 0 };
}

/* -------------------------------------------- */

/** Roll on the ATOW hit location table (with Torso / Legs sub-location). */
export async function rollHitLocation() {
  const roll = await new Roll("2d6").evaluate();
  let location = RULES.hitLocations[roll.total];
  let sub = null;
  if (location === "Torso" || location === "Legs") {
    sub = await new Roll("1d6").evaluate();
    if (location === "Torso") location = sub.total <= 4 ? "Chest" : "Abdomen";
    else location = sub.total <= 3 ? "Left Leg" : "Right Leg";
  }
  return { roll, sub, location };
}

/* -------------------------------------------- */
/*  Pre-filled attack macros                    */
/* -------------------------------------------- */

const ATTACK_MACROS = {
  melee: { id: "jvSmI206CbLA9J8z", title: "Melee Combat Roll" },
  ranged: { id: "kc4pta6eq8PTf3Ye", title: "Ranged Combat" }
};
const MELEE_SKILLS = ["Martial Arts", "Melee Weapons"];
const RANGED_SKILLS = ["Archery", "Artillery", "Gunnery", "Small Arms", "Support Weapons", "Thrown Weapons"];

/** Number at the start of "4B", "3", "2M"; 0 when blank. */
const leadingNumber = v => toInt(v) ?? 0;

/** Resolve the skill numbers for a weapon row (named skill row, or the NPC's level number). */
export function weaponSkill(actor, weapon) {
  const skillCell = weapon.skill;
  const numeric = String(skillCell ?? "").trim().match(/^[+-]?\d+$/) ? toInt(skillCell) : null;
  const skillName = numeric === null && String(skillCell ?? "").trim() ? String(skillCell).trim() : defaultWeaponSkill(weapon);
  let row = findSkillRow(actor, skillName);
  if (numeric !== null) row = { ...(row ?? { name: skillName }), lvl: numeric };
  if (!row) row = { name: skillName, lvl: "" };
  return { row, resolved: resolveSkill(actor, row), skillName };
}

/** Pick the dialog's option matching a skill name ("Gunnery (Mech)" -> "Gunnery"). */
function matchOption(name, options, fallback) {
  const n = String(name ?? "").toLowerCase();
  return options.find(o => n.startsWith(o.toLowerCase())) ?? fallback;
}

/**
 * Open the compendium Melee Attack or Ranged Attack dialog with the PC section filled in from
 * the sheet. Ranged attacks also decrement numeric ammo when the dialog's Roll is used.
 */
export async function openAttackDialog(actor, weapon) {
  const melee = isMelee(weapon);
  const cfg = melee ? ATTACK_MACROS.melee : ATTACK_MACROS.ranged;
  const pack = game.packs.get("mechwarrior-rpg-homebrew.atow-checks");
  const macro = await pack?.getDocument(cfg.id);
  if (!macro) return ui.notifications.error("Attack macro not found in the ATOW Checks compendium.");

  const ammo = toInt(weapon.ammo);
  if (!melee && ammo !== null && ammo <= 0) return ui.notifications.warn(`${weapon.name} is out of ammunition.`);

  const { resolved } = weaponSkill(actor, weapon);
  const trained = resolved.level !== null;
  const values = {
    skill: matchOption(resolved.name, melee ? MELEE_SKILLS : RANGED_SKILLS, melee ? "Melee Weapons" : "Small Arms"),
    level: trained ? resolved.level : 0,
    link: resolved.linkTotal,
    mods: trained ? 0 : -4,
    na: hasNaturalAptitude(actor, resolved.name),
    bd: leadingNumber(weapon.bd),
    ap: leadingNumber(weapon.ap),
    tn: resolved.tn
  };

  const fill = (app, html) => {
    const title = app.title ?? app.data?.title;
    if (title !== cfg.title) return false;
    const root = html[0] ?? html;
    const set = (name, v) => {
      const el = root.querySelector(`[name="${name}"]`);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = v;
    };
    const s = melee ? "_char1" : "";
    set(`skill${s}`, values.skill);
    set(`skillLevel${s}`, values.level);
    set(`link${s}`, values.link);
    set(melee ? "modifiers_char1" : "additionalModifier", values.mods);
    set(`naturalAptitude${s}`, values.na);
    set(melee ? "bd_char1" : "baseDamage", values.bd);
    set(melee ? "ap_char1" : "armorPiercing", values.ap);
    if (!melee) set("range", "0"); // Short, not the first option (Point Blank)
    const cx = root.querySelector(`[name="complexity${s}"]`);
    if (cx && [...cx.options].some(o => Number(o.value) === values.tn)) cx.value = String(values.tn);
    // Label the PC section with the actor and weapon
    const h3 = root.querySelector("h3");
    if (melee && h3) h3.textContent = `PC: ${actor.name} — ${weapon.name}`;
    else root.querySelector("form")?.insertAdjacentHTML("afterbegin", `<p class="atow-hint"><strong>${esc(actor.name)}</strong> — ${esc(weapon.name)}</p>`);
    // When the attack is rolled: count ammo, and tell the damage automation who is attacking with what
    if (app.data?.buttons?.roll) {
      const orig = app.data.buttons.roll.callback;
      app.data.buttons.roll.callback = async h => {
        if (!melee && ammo !== null && weapon._slotPath) {
          const current = toInt(foundry.utils.getProperty(actor, `${weapon._slotPath}.ammo`));
          if (current !== null) await actor.update({ [`${weapon._slotPath}.ammo`]: Math.max(current - 1, 0) });
        }
        return withAttackContext({ actor, weapon }, () => orig?.(h));
      };
    }
    app.setPosition?.({ height: "auto" });
    return true;
  };

  const hookId = Hooks.on("renderDialog", (app, html) => {
    if (fill(app, html)) Hooks.off("renderDialog", hookId);
  });
  setTimeout(() => Hooks.off("renderDialog", hookId), 10000);
  return macro.execute({ actor, token: actor.getActiveTokens?.()[0] ?? null });
}

/**
 * Weapon attack from a weapon row. Uses the named skill row (or the numeric skill level
 * written by NPC sheets), range modifiers, decrements numeric ammo, and rolls hit location.
 */
export async function rollWeapon(actor, weapon, { sheet } = {}) {
  const melee = isMelee(weapon);
  const rangeOpts = melee ? "" : `<div class="form-group"><label>Range (${esc(weapon.range || "—")})</label><select name="range">
      <option value="pointBlank">Point Blank (+1)</option><option value="short" selected>Short (0)</option>
      <option value="medium">Medium (−2)</option><option value="long">Long (−4)</option><option value="extreme">Extreme (−6)</option></select></div>`;
  const r = await promptModifiers(`Attack: ${weapon.name}`, rangeOpts);
  if (!r) return null;

  // Skill: column may hold a skill name ("Small Arms") or a level number (NPC data)
  const { row } = weaponSkill(actor, weapon);

  const rangeMod = melee ? 0 : (RULES.rangeMods[r.range] ?? 0);
  const extraRows = [["Weapon", esc(weapon.name)], ["Skill", esc(row.name)]];
  if (!melee) extraRows.push(["Range", `${RANGE_LABELS[r.range] ?? esc(r.range)} (${formatMod(rangeMod)})`]);

  // Ammo
  const ammo = toInt(weapon.ammo);
  if (ammo !== null && !melee) {
    if (ammo <= 0) {
      ui.notifications.warn(`${weapon.name} is out of ammunition.`);
      return null;
    }
    extraRows.push(["Ammo", `${ammo} → ${ammo - 1}`]);
  }

  const result = await rollSkill(actor, row, { extraRows, extraMod: rangeMod + r.mod, title: `${weapon.name} Attack` });
  if (!result) return null;
  if (ammo !== null && !melee && weapon._slotPath) await actor.update({ [`${weapon._slotPath}.ammo`]: ammo - 1 });

  if (result.success) {
    const hit = await rollHitLocation();
    const dmg = card({
      title: `${weapon.name} — Hit`, rows: [
        ["AP", esc(weapon.ap || "—")], ["BD", esc(weapon.bd || "—")],
        ["Hit location", `<strong>${esc(hit.location)}</strong> (2d6: ${hit.roll.total}${hit.sub ? `, d6: ${hit.sub.total}` : ""})`],
        ...(weapon.notes ? [["Notes", esc(weapon.notes)]] : [])
      ]
    });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: dmg });
  }
  return result;
}
