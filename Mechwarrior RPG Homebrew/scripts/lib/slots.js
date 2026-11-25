/**
 * Sheet slot layouts, item categorisation, and Item <-> sheet-row mapping.
 *
 * The ATOW sheets store rows in fixed "slots" on the actor (system.skills.s1 ... s30 etc.),
 * which is how the Fantasy Grounds port and all existing actors store data. Dropped Items are
 * written into the first free slot, and also embedded on the actor; the slot keeps the embedded
 * item's id in `itemId` so edits flow both ways.
 */
import {
  MODULE_ID, toInt, formatLinks, formatTNC, attributeKey, damageLetter, stripHtml, defaultWeaponSkill,
  RULES
} from "./rules.js";

export const CATEGORIES = ["skill", "trait", "weapon", "armor", "equipment"];
export const CATEGORY_LABELS = {
  skill: "Skill", trait: "Trait", weapon: "Weapon", armor: "Armor", equipment: "Equipment"
};

/** Column definitions per slot group. */
export const GROUP_FIELDS = {
  traits: ["name", "tp", "xp"],
  skills: ["name", "lvl", "links", "tnc", "xp"],
  armor: ["name", "loc", "type", "m", "b", "e", "x"],
  weapons: ["name", "skill", "ap", "bd", "range", "ammo", "notes"],
  inventory: ["item", "loc", "data"]
};
export const GROUP_PREFIX = { traits: "t", skills: "s", armor: "a", weapons: "w", inventory: "i", notes: "n", bio: "m" };
/** Field holding the row's display name in each group. */
export const NAME_FIELD = { traits: "name", skills: "name", armor: "name", weapons: "name", inventory: "item" };

/**
 * Sheet layouts. `sections` maps a drop-zone id to the categories it accepts and to the slot group
 * each category lands in.
 */
export const LAYOUTS = {
  character: {
    counts: { traits: 10, skills: 30, armor: 4, weapons: 6, inventory: 20, notes: 20, bio: 10 },
    fields: { traits: ["name", "tp", "xp"], skills: ["name", "lvl", "links", "tnc", "xp"] },
    sections: {
      "traits-skills": { label: "Traits/Skills", accepts: { trait: "traits", skill: "skills" } },
      combat: { label: "Combat", accepts: { armor: "armor", weapon: "weapons" } },
      other: { label: "Other", accepts: { armor: "inventory", weapon: "inventory", equipment: "inventory" } }
    }
  },
  npc: {
    counts: { traits: 8, skills: 20, armor: 4, weapons: 6, notes: 10 },
    fields: { traits: ["name", "tp"], skills: ["name", "lvl", "links", "tnc"] },
    sections: {
      "traits-skills": { label: "Traits/Skills", accepts: { trait: "traits", skill: "skills" } },
      combat: { label: "Combat", accepts: { armor: "armor", weapon: "weapons" } }
    }
  },
  troop: {
    counts: { skills: 4, armor: 2, weapons: 4, notes: 5 },
    fields: { skills: ["name", "lvl", "links", "tnc"] },
    sections: {
      "traits-skills": { label: "Skills", accepts: { skill: "skills" } },
      combat: { label: "Combat", accepts: { armor: "armor", weapon: "weapons" } }
    }
  }
};

/** Section an item goes to when dropped somewhere other than a drop zone. */
export const AUTO_SECTION = { skill: "traits-skills", trait: "traits-skills", armor: "combat", weapon: "combat", equipment: "other" };

const FOLDER_CATEGORY = {
  skill: "skill", skills: "skill", trait: "trait", traits: "trait", weapon: "weapon", weapons: "weapon",
  armor: "armor", armour: "armor", equipment: "equipment", gear: "equipment"
};

/**
 * Work out which ATOW category an Item belongs to.
 * Order: module flag -> item.type (typed systems) -> folder name -> shape of system.props.
 * @param {Item} item
 * @returns {string|null}
 */
export function itemCategory(item) {
  const flag = item.getFlag?.(MODULE_ID, "category") ?? item.flags?.[MODULE_ID]?.category;
  if (CATEGORIES.includes(flag)) return flag;
  const type = String(item.type ?? "").toLowerCase();
  if (FOLDER_CATEGORY[type]) return FOLDER_CATEGORY[type];
  let folder = item.folder;
  while (folder) {
    const fc = FOLDER_CATEGORY[String(folder.name ?? "").trim().toLowerCase()];
    if (fc) return fc;
    folder = folder.folder;
  }
  const p = item.system?.props ?? {};
  if ("a1" in p || "tn" in p) return "skill";
  if ("bd" in p || "ap" in p || "rof" in p) return "weapon";
  if ("m" in p && "b" in p && "e" in p && "x" in p) return "armor";
  if ("tp" in p) return "trait";
  if ("cost" in p || "mass" in p) return "equipment";
  return null;
}

const props = item => item.system?.props ?? {};
const blankIfNull = v => (v === null || v === undefined ? "" : v);

function weaponNotes(p) {
  const parts = [];
  if (p.rof !== undefined && p.rof !== "" && Number(p.rof) !== 1) parts.push(`ROF ${p.rof}`);
  if (p.special) parts.push(String(p.special));
  const n = stripHtml(p.notes);
  if (n) parts.push(n);
  return parts.join("; ");
}

function summary(category, p) {
  const bits = [];
  if (category === "weapon") {
    const L = damageLetter(p["damage type"]);
    bits.push(`AP ${blankIfNull(p.ap)}${L}`, `BD ${blankIfNull(p.bd)}${L}`);
    if (L !== "M") {
      if (p.range) bits.push(`Rng ${p.range}`);
      if (p.shots !== undefined && p.shots !== "") bits.push(L === "E" ? `${p.shots} PPS` : `Shots ${p.shots}`);
    }
  } else if (category === "armor") {
    bits.push(`BAR ${p.m}/${p.b}/${p.e}/${p.x} (M/B/E/X)`);
    if (p.coverage) bits.push(p.coverage);
  }
  if (p.mass !== undefined && p.mass !== "") bits.push(`${p.mass} kg`);
  if (p.cost !== undefined && p.cost !== "") bits.push(`${p.cost} C-bills`);
  const n = stripHtml(p.notes);
  if (n) bits.push(n);
  return bits.join(", ");
}

/**
 * Build the row data for a dropped item.
 * @param {string} category
 * @param {string} group   Slot group (traits, skills, armor, weapons, inventory)
 * @param {Item} item
 * @param {string[]} fields  Fields this layout shows for the group
 */
export function rowFromItem(category, group, item, fields) {
  const p = props(item);
  const name = p.name || item.name;
  let row;
  switch (group) {
    case "traits": {
      const tp = toInt(p.tp) ?? 0;
      row = { name, tp, xp: tp * RULES.xpPerTraitPoint };
      break;
    }
    case "skills": {
      const links = [p.a1, p.a2].map(attributeKey).filter(Boolean);
      row = { name, lvl: 0, links: formatLinks(links), tnc: formatTNC(toInt(p.tn), p.c), xp: RULES.skillXp[0] };
      break;
    }
    case "armor":
      row = { name, loc: blankIfNull(p.coverage), type: "Personal", m: blankIfNull(p.m), b: blankIfNull(p.b), e: blankIfNull(p.e), x: blankIfNull(p.x) };
      break;
    case "weapons": {
      const L = damageLetter(p["damage type"]);
      row = {
        name,
        skill: defaultWeaponSkill({ name, ap: `${p.ap}${L}`, range: p.range }),
        ap: p.ap === undefined || p.ap === "" ? "" : `${p.ap}${L}`,
        bd: p.bd === undefined || p.bd === "" ? "" : `${p.bd}${L}`,
        range: /^\s*1\s*$/.test(String(p.range ?? "")) && L === "M" ? "Melee" : blankIfNull(p.range),
        // Melee weapons carry a nominal "1" shot in the FG data; for energy weapons "shots" is
        // power points used per shot, not a magazine. Only track ammo for the others.
        ammo: L === "M" || L === "E" ? "" : blankIfNull(p.shots),
        notes: [L === "E" && p.shots !== undefined && p.shots !== "" ? `${p.shots} PPS` : "", weaponNotes(p)].filter(Boolean).join("; ")
      };
      break;
    }
    case "inventory":
      row = { item: name, loc: "Carried", data: summary(category, p) };
      break;
    default:
      row = {};
  }
  const out = {};
  for (const f of fields) out[f] = row[f] ?? "";
  out.itemId = item.id;
  return out;
}

/**
 * Reverse mapping: a sheet cell edit -> update data for the linked embedded Item.
 * Only fields with a clean 1:1 meaning are synced; derived columns are left alone.
 * @returns {object|null} update data for Item#update
 */
export function itemUpdateFromCell(category, group, field, value) {
  if (field === NAME_FIELD[group]) return { name: value, "system.props.name": value };
  const num = v => (toInt(v) ?? v);
  switch (group) {
    case "traits":
      if (field === "tp") return { "system.props.tp": num(value) };
      return null;
    case "skills":
      if (field === "tnc") {
        const tn = toInt(value);
        const c = String(value).match(/[A-Za-z]{2}/)?.[0]?.toUpperCase();
        const u = {};
        if (tn !== null) u["system.props.tn"] = tn;
        if (c) u["system.props.c"] = c;
        return Object.keys(u).length ? u : null;
      }
      if (field === "links") {
        const keys = String(value).split(/[^A-Za-z]+/).map(attributeKey).filter(Boolean);
        return { "system.props.a1": keys[0] ?? "", "system.props.a2": keys[1] ?? "" };
      }
      return null;
    case "armor":
      if (["m", "b", "e", "x"].includes(field)) return { [`system.props.${field}`]: num(value) };
      if (field === "loc") return { "system.props.coverage": value };
      return null;
    case "weapons":
      if (field === "ap" || field === "bd") return { [`system.props.${field}`]: num(value) };
      if (field === "range") return { "system.props.range": value };
      if (field === "ammo") return { "system.props.shots": num(value) };
      return null;
    default:
      return null;
  }
}

/** Forward sync: an embedded Item changed (e.g. via its sheet) -> slot row update. */
export function cellsFromItem(category, group, item, fields) {
  const fresh = rowFromItem(category, group, item, fields);
  // Do not clobber progression the player tracks on the sheet
  delete fresh.lvl;
  delete fresh.xp;
  if (group === "inventory") delete fresh.loc;
  if (group === "armor") delete fresh.type;
  if (group === "weapons") { delete fresh.skill; delete fresh.ammo; }
  delete fresh.itemId;
  return fresh;
}

/** Is a slot row empty? */
export function rowIsEmpty(row, group) {
  if (!row) return true;
  const nameField = NAME_FIELD[group];
  return String(row[nameField] ?? "").trim() === "" && !row.itemId;
}
