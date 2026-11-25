/**
 * A Time of War rules helpers (pure functions, no Foundry calls).
 * All tunable rule numbers live in RULES so a GM can audit them in one place.
 */
import { SKILL_DATA } from "./skill-data.js";

export const MODULE_ID = "mechwarrior-rpg-homebrew";

export const ATTRIBUTES = ["str", "bod", "rfl", "dex", "int", "wil", "cha", "edg"];
export const ATTRIBUTE_LABELS = {
  str: "STR", bod: "BOD", rfl: "RFL", dex: "DEX", int: "INT", wil: "WIL", cha: "CHA", edg: "EDG"
};

export const RULES = {
  /** ATOW Link Attribute Modifier table: [minScore, modifier], checked top-down. */
  linkTable: [[11, 3], [10, 2], [7, 1], [4, 0], [2, -1], [1, -2], [-Infinity, -4]],
  /** XP needed for skill levels 0..10 (ATOW standard advancement). */
  skillXp: [20, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570],
  fastLearnerMultiplier: 0.9,
  slowLearnerMultiplier: 1.1,
  /** XP per attribute point and per trait point. */
  xpPerAttributePoint: 100,
  xpPerTraitPoint: 100,
  /** Target numbers for attribute checks. */
  singleAttributeTN: 12,
  doubleAttributeTN: 18,
  /** Ranged attack range modifiers. */
  rangeMods: { pointBlank: 1, short: 0, medium: -2, long: -4, extreme: -6 },
  /** Hit location table (2d6) with sub-location d6 splits. */
  hitLocations: {
    2: "Head", 3: "Left Foot", 4: "Left Hand", 5: "Left Arm", 6: "Torso", 7: "Legs",
    8: "Torso", 9: "Right Arm", 10: "Right Hand", 11: "Right Foot", 12: "Head"
  }
};

/** Margin-of-success descriptions used by the original macros. */
export function marginDescription(margin) {
  if (margin >= 7) return "Spectacular";
  if (margin >= 5) return "Extraordinary";
  if (margin >= 3) return "Good";
  if (margin >= 1) return "It'll do...";
  if (margin === 0) return "Barely made it!";
  if (margin >= -2) return "Almost...";
  if (margin >= -4) return "Bad";
  if (margin >= -6) return "Terrible";
  return "Disastrous";
}

/** Read the leading integer of a value such as 7, "7", or "7 (+1)". Returns null when blank. */
export function toInt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  const m = String(value).trim().match(/^[+-]?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export function linkModifier(score) {
  const s = toInt(score);
  if (s === null) return 0;
  for (const [min, mod] of RULES.linkTable) if (s >= min) return mod;
  return -4;
}

export function formatMod(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** Normalise attribute tokens ("RFL", "ref", "Reflexes") to sheet keys. */
export function attributeKey(token) {
  const t = String(token ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("ref") || t === "rfl") return "rfl";
  if (t.startsWith("bod")) return "bod";
  if (t.startsWith("str")) return "str";
  if (t.startsWith("dex")) return "dex";
  if (t.startsWith("int")) return "int";
  if (t.startsWith("wil")) return "wil";
  if (t.startsWith("cha")) return "cha";
  if (t.startsWith("edg")) return "edg";
  return null;
}

/** Parse "DEX + RFL", "INT/WIL", "dex" into ["dex","rfl"]. */
export function parseLinks(text) {
  return String(text ?? "").split(/[^A-Za-z]+/).map(attributeKey).filter(Boolean);
}

export function formatLinks(keys) {
  return keys.map(k => ATTRIBUTE_LABELS[k] ?? k.toUpperCase()).join(" + ");
}

/** Parse "8 / SA", "9/CA", "7" into {tn, complexity}. */
export function parseTNC(text) {
  const s = String(text ?? "");
  const tn = toInt(s);
  const c = s.match(/[A-Za-z]{2}/);
  return { tn, complexity: c ? c[0].toUpperCase() : "" };
}

export function formatTNC(tn, c) {
  if (tn === null || tn === undefined || tn === "") return "";
  return c ? `${tn} / ${c}` : `${tn}`;
}

/** Skill level from XP; returns null if xp is blank or below level 0 cost. */
export function skillLevelFromXp(xp, multiplier = 1) {
  const x = toInt(xp);
  if (x === null) return null;
  let level = null;
  RULES.skillXp.forEach((cost, lvl) => { if (x >= Math.round(cost * multiplier)) level = lvl; });
  return level;
}

export function attributeFromXp(xp) {
  const x = toInt(xp);
  return x === null ? null : Math.trunc(x / RULES.xpPerAttributePoint);
}

export function traitPointsFromXp(xp) {
  const x = toInt(xp);
  return x === null ? null : Math.trunc(x / RULES.xpPerTraitPoint);
}

/* -------------------------------------------- */
/*  Skill reference lookup (FG data)            */
/* -------------------------------------------- */

const norm = s => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();
const SKILL_INDEX = new Map(Object.entries(SKILL_DATA).map(([k, v]) => [norm(k), { name: k, links: v[0].map(attributeKey), tn: v[1], complexity: v[2] }]));

/**
 * Find reference data for a skill as written on a sheet: "Gunnery (Mech)", "Small Arms",
 * "Melee Weapons", "Martial Arts" etc. Returns {name, links, tn, complexity} or null.
 */
export function lookupSkill(name) {
  const n = norm(name);
  if (!n) return null;
  if (SKILL_INDEX.has(n)) return SKILL_INDEX.get(n);
  const m = n.match(/^(.+?)\s*\((.+)\)$/);
  const base = (m ? m[1] : n).trim();
  const sub = m ? m[2].trim() : "";
  const tries = [];
  if (sub) tries.push(`${base} - ${sub}`, `${base} [${sub}]`);
  // "[Basic]"/"[Advanced]" variants were merged into one skill for Computers, Martial Arts, etc.
  tries.push(base, `${base} [basic]`, base.replace(/\s*\[(basic|advanced)\]$/, ""));
  for (const t of tries) if (SKILL_INDEX.has(t)) return SKILL_INDEX.get(t);
  // Prefix match ("gunnery" -> first "gunnery - ...")
  for (const [k, v] of SKILL_INDEX) if (k.startsWith(`${base} `) || k.startsWith(`${base}-`)) return v;
  return null;
}

/** Default skill used for a weapon row when the sheet gives only a number. */
export function defaultWeaponSkill(weapon) {
  const n = norm(weapon?.name);
  const ap = String(weapon?.ap ?? "");
  const range = norm(weapon?.range);
  if (/unarmed|martial|punch|kick/.test(n)) return "Martial Arts";
  // Launchers and machine guns before the thrown check: "Grenade Launcher" is a support weapon
  if (/machine ?gun|support|launcher/.test(n)) return "Support Weapons";
  if (/grenade|satchel|shuriken|throw/.test(n)) return "Thrown Weapons";
  if (/\bbow\b|crossbow/.test(n)) return "Archery";
  // Whole words only: "Combat Shotgun" must not match "bat"
  if (range === "melee" || /m$/i.test(ap.trim()) || /\b(melee|sword|knife|dagger|baton|stick|axe|katana|bat|wakizashi|scimitar)\b/.test(n)) return "Melee Weapons";
  return "Small Arms";
}

/** Martial Arts / unarmed BD: 1 point per 4 points of STR, rounded up. */
export function martialArtsBD(str) {
  const s = toInt(str);
  return s === null ? null : Math.ceil(s / 4);
}

/** Is a weapon row a Martial Arts / unarmed attack? */
export function isMartialArts(weapon) {
  return defaultWeaponSkill(weapon) === "Martial Arts" || /martial/i.test(String(weapon?.skill ?? ""));
}

/** Is a weapon row a melee weapon? */
export function isMelee(weapon) {
  return ["Melee Weapons", "Martial Arts"].includes(defaultWeaponSkill(weapon));
}

/** Damage-type letter used in AP/BD columns ("4B"). */
export function damageLetter(type) {
  const t = norm(type);
  if (t.startsWith("bal")) return "B";
  if (t.startsWith("ene")) return "E";
  if (t.startsWith("mel")) return "M";
  if (t.startsWith("exp")) return "X";
  return "";
}

/** Strip HTML for compact table cells. */
export function stripHtml(html) {
  return String(html ?? "").replace(/<\/p>\s*<p>/gi, "; ").replace(/<br\s*\/?>/gi, "; ")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** Escape text for safe insertion into chat HTML. */
export function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
