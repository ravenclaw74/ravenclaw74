/**
 * Shared base class for the ATOW character, NPC and troop sheets.
 *  - Section-specific drag & drop (data-drop-section="traits-skills" | "combat" | "other")
 *  - Auto-population of slot rows from dropped Items, embedded + linked for two-way sync
 *  - Fantasy-Grounds style automation: XP -> level/score, skill links/TN lookup, link modifiers,
 *    damage capacity, movement, one-click attribute / skill / weapon rolls.
 */
import {
  MODULE_ID, ATTRIBUTES, ATTRIBUTE_LABELS, RULES, toInt, linkModifier, formatMod, lookupSkill, formatLinks,
  formatTNC, skillLevelFromXp, attributeFromXp, traitPointsFromXp
} from "./rules.js";
import {
  LAYOUTS, GROUP_PREFIX, NAME_FIELD, AUTO_SECTION, CATEGORY_LABELS, itemCategory, rowFromItem,
  itemUpdateFromCell, rowIsEmpty, cellsFromItem
} from "./slots.js";
import { rollAttribute, rollSkill, rollWeapon, openAttackDialog, findSkillRow } from "./rolls.js";
import { martialArtsBD, isMartialArts } from "./rules.js";

const BaseActorSheet = foundry.appv1?.sheets?.ActorSheet ?? globalThis.ActorSheet;

/** "Gunnery (Mech)", "Gunnery - Mech", "gunnery mech" -> "gunnery mech" */
function normalizeName(name) {
  return String(name ?? "").toLowerCase().replace(/[’']/g, "").replace(/[()\[\]\-–:,/]+/g, " ").replace(/\s+/g, " ").trim();
}
const TextEditorImpl = () => foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

/** Macro links still offered on the sheets (tools without a sheet-driven equivalent). */
const MACROS = {
  dualAttr: ["FYoIfLh4De5ptjOt", "Attribute Check"],
  opposedAttr: ["cztQJHa3Ft2x0FAT", "Opposed Attribute Check"],
  edgeSave: ["RB3Vr6fC0wYNvDHl", "Edge Save"],
  wealthCheck: ["c7vJUYnhZWKCnvyn", "Wealth Check"],
  skillCheck: ["2pFTD0VbxbwyB9Bj", "Skill Check"],
  opposedSkill: ["UpbfgDQuMZXMyxT7", "Opposed Skill Check"],
  bundledSkill: ["spAIsYVtCsT52irc", "Bundled Skill Check"],
  initiative: ["1ZklyZtLbpmnnBHq", "Initiative"],
  meleeAttack: ["jvSmI206CbLA9J8z", "Melee Attack"],
  rangedAttack: ["kc4pta6eq8PTf3Ye", "Ranged Attack"],
  hitLocation: ["Io12n3GN4J1uvgQV", "Hit Location"]
};

const COLUMNS = {
  traits: { name: ["Trait", "60%"], tp: ["TP", "20%"], xp: ["XP", "20%"] },
  skills: { name: ["Skill", "40%"], lvl: ["Lvl", "10%"], links: ["Links", "20%"], tnc: ["TN/C", "15%"], xp: ["XP", "15%"] },
  armor: { name: ["Personal Armor", "30%"], loc: ["Location", "22%"], type: ["Armor Type", "16%"], m: ["M", "8%"], b: ["B", "8%"], e: ["E", "8%"], x: ["X", "8%"] },
  weapons: { name: ["Weapon", "22%"], skill: ["Skill", "14%"], ap: ["AP", "7%"], bd: ["BD", "7%"], range: ["Range", "16%"], ammo: ["Ammo", "8%"], notes: ["Notes", "26%"] },
  inventory: { item: ["Item", "30%"], loc: ["Location", "15%"], data: ["Data/Statistics", "55%"] }
};
const DEFAULT_FIELDS = {
  traits: ["name", "tp", "xp"], skills: ["name", "lvl", "links", "tnc", "xp"],
  armor: ["name", "loc", "type", "m", "b", "e", "x"], weapons: ["name", "skill", "ap", "bd", "range", "ammo", "notes"],
  inventory: ["item", "loc", "data"]
};

export class ATOWBaseSheet extends BaseActorSheet {
  /** Layout key in LAYOUTS; overridden by subclasses. */
  static layoutKey = "character";

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["atow", "sheet", "actor"],
      width: 860,
      height: 900,
      resizable: true,
      submitOnChange: true,
      dragDrop: [{ dragSelector: null, dropSelector: null }],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
    });
  }

  get layout() {
    return LAYOUTS[this.constructor.layoutKey];
  }

  fieldsFor(group) {
    return this.layout.fields?.[group] ?? DEFAULT_FIELDS[group];
  }

  /* -------------------------------------------- */
  /*  Data                                        */
  /* -------------------------------------------- */

  /** @override */
  async getData(options) {
    const context = await super.getData(options);
    const actor = this.actor;
    const system = actor.system ?? {};
    context.actor = actor;
    context.system = system;
    context.editable = this.isEditable;
    context.moduleId = MODULE_ID;

    // Attributes with link modifiers
    context.attributes = ATTRIBUTES.map(key => {
      const a = system.attributes?.[key] ?? {};
      return { key, label: ATTRIBUTE_LABELS[key], value: a.value ?? "", xp: a.xp ?? "", link: formatMod(linkModifier(a.value)) };
    });

    // Slot tables
    context.tables = {};
    for (const group of Object.keys(COLUMNS)) {
      if (!this.layout.counts[group]) continue;
      context.tables[group] = this._prepareTable(group);
    }
    context.notes = this._prepareSimpleSlots("notes");
    context.bio = this._prepareSimpleSlots("bio");

    // Derived values
    const bod = toInt(system.attributes?.bod?.value);
    const wil = toInt(system.attributes?.wil?.value);
    context.derived = {
      standardMax: bod === null ? "—" : bod * 2,
      fatigueMax: wil === null ? "—" : wil * 2,
      movement: this._computeMovement()
    };

    context.dropSections = this.layout.sections;
    context.enrichedMacros = {};
    const TE = TextEditorImpl();
    for (const [key, [id, label]] of Object.entries(MACROS)) {
      context.enrichedMacros[key] = await TE.enrichHTML(`@UUID[Compendium.${MODULE_ID}.atow-checks.Macro.${id}]{${label}}`);
    }
    context.enrichedBiography = await TE.enrichHTML(system.biography ?? "", { relativeTo: actor, secrets: actor.isOwner });
    return context;
  }

  _slotKeys(group) {
    const prefix = GROUP_PREFIX[group];
    const data = this.actor.system?.[group] ?? {};
    let n = this.layout.counts[group] ?? 0;
    for (const k of Object.keys(data)) {
      const m = k.match(new RegExp(`^${prefix}(\\d+)$`));
      if (m) n = Math.max(n, Number(m[1]));
    }
    return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
  }

  _prepareSimpleSlots(group) {
    if (!this.layout.counts[group]) return [];
    const data = this.actor.system?.[group] ?? {};
    return this._slotKeys(group).map(key => ({ key, path: `system.${group}.${key}`, value: data[key] ?? "", data: data[key] ?? {} }));
  }

  _prepareTable(group) {
    const fields = this.fieldsFor(group);
    const data = this.actor.system?.[group] ?? {};
    const rows = this._slotKeys(group).map(key => {
      const row = data[key] ?? {};
      const empty = rowIsEmpty(row, group);
      const item = row.itemId ? this.actor.items.get(row.itemId) : null;
      return {
        key, group,
        path: `system.${group}.${key}`,
        empty,
        itemId: item ? item.id : "",
        img: item?.img ?? "",
        rollable: !empty && (group === "skills" || group === "weapons"),
        cells: fields.map(field => ({ field, name: `system.${group}.${key}.${field}`, value: row[field] ?? "" }))
      };
    });
    return {
      group,
      columns: fields.map(f => ({ field: f, label: COLUMNS[group][f][0], width: COLUMNS[group][f][1] })),
      rows
    };
  }

  _computeMovement() {
    const s = this.actor.system ?? {};
    const str = toInt(s.attributes?.str?.value), rfl = toInt(s.attributes?.rfl?.value);
    if (str === null || rfl === null) return null;
    const lvl = n => toInt(findSkillRow(this.actor, n)?.lvl) ?? 0;
    const walk = str + rfl;
    const run = 10 + walk + lvl("Running");
    return {
      walk, run, sprint: run * 2,
      climb: Math.ceil(walk / 2) + lvl("Climbing"),
      crawl: Math.ceil(walk / 4),
      swim: walk + lvl("Swimming")
    };
  }

  /* -------------------------------------------- */
  /*  Listeners                                   */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] ?? html;

    // Restore focus after a re-render triggered by an inline edit
    if (this._refocus) {
      const el = root.querySelector(`[name="${CSS.escape(this._refocus)}"]`);
      this._refocus = null;
      if (el) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    // Drop-zone highlighting works for everyone who can edit
    this._activateDropZones(root);

    // Roll buttons are available to owners even on locked sheets
    if (this.actor.isOwner) {
      root.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", ev => this._onAction(ev)));
    }

    if (!this.isEditable) {
      root.querySelectorAll('[contenteditable="true"]').forEach(el => el.setAttribute("contenteditable", "false"));
      return;
    }

    root.querySelectorAll('[contenteditable="true"]').forEach(el => {
      el.dataset.original = el.innerText.trim();
      el.addEventListener("keydown", ev => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          el.blur();
        }
      });
      el.addEventListener("paste", ev => {
        // Paste as plain text so HTML never lands in actor data
        ev.preventDefault();
        const text = (ev.clipboardData ?? window.clipboardData).getData("text");
        document.execCommand("insertText", false, text);
      });
      el.addEventListener("blur", ev => this._onCellBlur(ev));
    });
  }

  _activateDropZones(root) {
    const zones = [...root.querySelectorAll("[data-drop-section]")];
    if (root.matches?.("[data-drop-section]")) zones.push(root);
    zones.forEach(zone => {
      zone.classList.add("mwrpg-drop-zone");
      zone.addEventListener("dragenter", ev => { ev.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragover", ev => { ev.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", ev => {
        if (!zone.contains(ev.relatedTarget)) zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", () => zone.classList.remove("drag-over"));
    });
  }

  /** Commit a contenteditable cell. */
  async _onCellBlur(ev) {
    const el = ev.currentTarget;
    const field = el.getAttribute("name");
    if (!field) return;
    const raw = el.innerText.replace(/ /g, " ").trim();
    if (raw === el.dataset.original) return;
    el.dataset.original = raw;
    const value = raw !== "" && !isNaN(raw) ? Number(raw) : raw;

    // Keep focus moving naturally between cells across the re-render
    const next = ev.relatedTarget;
    if (next?.getAttribute?.("contenteditable") === "true") this._refocus = next.getAttribute("name");

    if (field === "name") return this.actor.update({ name: raw || this.actor.name });

    // Blanking the name of a linked row frees the row and removes its item
    const nm = field.match(/^system\.(\w+)\.(\w+)\.(\w+)$/);
    if (nm && raw === "" && NAME_FIELD[nm[1]] === nm[3] && this.actor.system?.[nm[1]]?.[nm[2]]?.itemId) {
      return this.clearRow(nm[1], nm[2]);
    }

    const update = { [field]: value };
    this._applyAutomation(field, value, update);
    await this.actor.update(update);
    await this._syncCellToItem(field, value);
  }

  /** Fill in dependent values (XP -> level etc.) for an edited cell. Mutates `update`. */
  _applyAutomation(field, value, update) {
    const m = field.match(/^system\.(\w+)\.(\w+)\.(\w+)$/);
    if (!m) return;
    const [, group, key, col] = m;
    const sys = this.actor.system ?? {};
    const row = sys[group]?.[key] ?? {};
    const base = `system.${group}.${key}`;
    const blank = v => v === undefined || v === null || String(v).trim() === "";

    // STR changed (directly or via XP): Martial Arts / unarmed rows follow at 1 BD per 4 STR
    if (group === "attributes" && key === "str") {
      const str = col === "xp" ? attributeFromXp(value) : toInt(value);
      const bd = martialArtsBD(str);
      if (bd !== null) {
        for (const [wk, w] of Object.entries(sys.weapons ?? {})) {
          if (w?.name && isMartialArts(w)) update[`system.weapons.${wk}.bd`] = `${bd}M`;
        }
      }
    }

    if (group === "attributes" && col === "xp") {
      const v = attributeFromXp(value);
      if (v !== null) update[`${base}.value`] = v;
    }
    if (group === "skills") {
      if (col === "xp") {
        const lvl = skillLevelFromXp(value, this._xpMultiplier());
        if (lvl !== null) update[`${base}.lvl`] = lvl;
      }
      if (col === "name") {
        const ref = lookupSkill(value);
        if (ref) {
          if (blank(row.links)) update[`${base}.links`] = formatLinks(ref.links);
          if (blank(row.tnc)) update[`${base}.tnc`] = formatTNC(ref.tn, ref.complexity);
        }
      }
    }
    if (group === "traits" && this.fieldsFor("traits").includes("xp")) {
      if (col === "xp") {
        const tp = traitPointsFromXp(value);
        if (tp !== null) update[`${base}.tp`] = tp;
      }
      if (col === "tp" && blank(row.xp) && toInt(value) !== null) update[`${base}.xp`] = toInt(value) * RULES.xpPerTraitPoint;
    }
  }

  _xpMultiplier() {
    const traits = Object.values(this.actor.system?.traits ?? {}).map(t => String(t?.name ?? "").toLowerCase());
    if (traits.some(t => t.startsWith("fast learner"))) return RULES.fastLearnerMultiplier;
    if (traits.some(t => t.startsWith("slow learner"))) return RULES.slowLearnerMultiplier;
    return 1;
  }

  /** Two-way sync: push an edited slot cell back to its linked embedded Item. */
  async _syncCellToItem(field, value) {
    const m = field.match(/^system\.(\w+)\.(\w+)\.(\w+)$/);
    if (!m) return;
    const [, group, key, col] = m;
    const row = this.actor.system?.[group]?.[key];
    const item = row?.itemId ? this.actor.items.get(row.itemId) : null;
    if (!item) return;
    const category = itemCategory(item);
    const upd = itemUpdateFromCell(category, group, col, value);
    if (upd) await item.update(upd, { [MODULE_ID]: { fromSheet: true } });
  }

  async _onAction(ev) {
    ev.preventDefault();
    const el = ev.currentTarget;
    const action = el.dataset.action;
    const rowEl = el.closest("[data-slot]");
    const group = rowEl?.dataset.group;
    const key = rowEl?.dataset.slot;
    const row = group && key ? (this.actor.system?.[group]?.[key] ?? {}) : null;
    switch (action) {
      case "roll-attribute":
        return rollAttribute(this.actor, el.dataset.attribute, { prompt: ev.shiftKey });
      case "roll-skill":
        return rollSkill(this.actor, row, { prompt: ev.shiftKey });
      case "roll-weapon": {
        const weapon = { ...row, _slotPath: `system.${group}.${key}` };
        // Click: the Melee/Ranged Attack dialog, pre-filled. Shift-click: quick automated attack.
        return ev.shiftKey ? rollWeapon(this.actor, weapon, { sheet: this }) : openAttackDialog(this.actor, weapon);
      }
      case "open-item": {
        const item = this.actor.items.get(row?.itemId);
        return item?.sheet.render(true);
      }
      case "clear-row":
        if (!this.isEditable) return;
        return this.clearRow(group, key);
      case "auto-movement": {
        if (!this.isEditable) return;
        const mv = this._computeMovement();
        if (!mv) return ui.notifications.warn("Enter STR and RFL to calculate movement.");
        const upd = {};
        for (const [k, v] of Object.entries(mv)) upd[`system.movement.${k}`] = v;
        return this.actor.update(upd);
      }
    }
  }

  /** Clear a slot row and delete its linked embedded Item. */
  async clearRow(group, key) {
    const row = this.actor.system?.[group]?.[key] ?? {};
    const blankRow = {};
    for (const f of this.fieldsFor(group)) blankRow[f] = "";
    blankRow.itemId = "";
    await this.actor.update({ [`system.${group}.${key}`]: blankRow });
    const item = row.itemId ? this.actor.items.get(row.itemId) : null;
    if (item) await item.delete({ [MODULE_ID]: { fromSheet: true } });
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    // Stop the event here so no outer handler (or base system listener) also processes it
    event.stopPropagation();
    this.element?.[0]?.querySelectorAll(".drag-over").forEach(z => z.classList.remove("drag-over"));
    return super._onDrop(event);
  }

  /** @override */
  /**
   * Serialise drops per actor so two quick drops can never pick the same free slot.
   * @param {Function} fn
   */
  _enqueue(fn) {
    const key = this.actor.uuid;
    const queues = (ATOWBaseSheet._dropQueues ??= new Map());
    const next = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
    queues.set(key, next.catch(() => {}));
    return next;
  }

  _canDrop() {
    if (this.actor.isOwner && this.isEditable) return true;
    ui.notifications.warn(`You don't have permission to add items to ${this.actor.name}.`);
    return false;
  }

  /** @override */
  async _onDropItem(event, data) {
    event.preventDefault();
    if (!this._canDrop()) return false;
    const zone = event.target?.closest?.("[data-drop-section]")?.dataset.dropSection ?? null;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    // Re-ordering an item already on this actor: nothing to route
    if (item.parent?.uuid === this.actor.uuid) return false;
    return this._enqueue(() => this.routeItem(item, zone));
  }

  /** @override - dropping a folder routes every item in it */
  async _onDropFolder(event, data) {
    event.preventDefault();
    if (!this._canDrop()) return [];
    const zone = event.target?.closest?.("[data-drop-section]")?.dataset.dropSection ?? null;
    const folder = await Folder.implementation.fromDropData(data);
    if (folder?.type !== "Item") return [];
    const items = await Promise.all(folder.contents.map(i => (i instanceof Item ? i : fromUuid(i.uuid))));
    return this._enqueue(async () => {
      const created = [];
      for (const it of items) {
        const res = await this.routeItem(it, zone, { quiet: true });
        if (res) created.push(res);
      }
      ui.notifications.info(`Added ${created.length} of ${items.length} items from "${folder.name}".`);
      return created;
    });
  }

  /** Ask which skill a bare "Natural Aptitude" trait applies to. Returns the row name to use. */
  async _naturalAptitudeName(name) {
    if (!/^natural aptitude\s*$/i.test(name)) return name;
    const skills = Object.values(this.actor.system?.skills ?? {}).map(s => s?.name).filter(Boolean);
    const opts = skills.map(s => `<option value="${foundry.utils.escapeHTML?.(s) ?? s}">`).join("");
    const picked = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Natural Aptitude" },
      content: `<div class="atow-dialog"><p>Which skill does this Natural Aptitude apply to? (Rolls for that skill use 3d6, keep the best 2.)</p>
        <div class="form-group"><label>Skill</label><input type="text" name="skill" list="atow-na-skills" autofocus><datalist id="atow-na-skills">${opts}</datalist></div></div>`,
      ok: { label: "OK", callback: (event, button) => button.form.elements.skill.value.trim() },
      rejectClose: false
    });
    return picked ? `Natural Aptitude (${picked})` : name;
  }

  /**
   * Validate an Item against a sheet section, create the embedded item and fill the first free slot.
   * @param {Item} item
   * @param {string|null} zone  data-drop-section id, or null to auto-route by category
   */
  async routeItem(item, zone, { quiet = false } = {}) {
    const category = itemCategory(item);
    const label = CATEGORY_LABELS[category] ?? "Unknown";
    if (!category) {
      ui.notifications.warn(`"${item.name}" is not an ATOW Trait, Skill, Weapon, Armor or Equipment item.`);
      return false;
    }
    const sectionId = zone ?? AUTO_SECTION[category];
    const section = this.layout.sections[sectionId];
    if (!section) {
      if (!quiet) ui.notifications.warn(`This sheet has no ${zone ? `"${zone}"` : "matching"} section for ${label} items.`);
      return false;
    }
    const group = section.accepts[category];
    if (!group) {
      const allowed = [...new Set(Object.keys(section.accepts).map(c => CATEGORY_LABELS[c]))].join(", ");
      ui.notifications.warn(`${label} items can't go in the ${section.label} section (accepts: ${allowed}).`);
      return false;
    }

    // Duplicate check within the target group. Names are normalised so the Fantasy Grounds form
    // "Gunnery (Mech)" on ported actors matches the compendium's "Gunnery - Mech".
    // Inventory may legitimately hold several of the same item, so it is exempt.
    const nameField = NAME_FIELD[group];
    const current = this.actor.system?.[group] ?? {};
    const itemName = item.system?.props?.name || item.name;
    if (group !== "inventory" && Object.values(current).some(r => normalizeName(r?.[nameField]) === normalizeName(itemName))) {
      if (!quiet) ui.notifications.warn(`${this.actor.name} already has "${itemName}" in ${section.label}.`);
      return false;
    }

    const key = this._slotKeys(group).find(k => rowIsEmpty(current[k], group))
      ?? `${GROUP_PREFIX[group]}${this._slotKeys(group).length + 1}`;

    // Embed the item (keeps the full description and stats with the actor)
    const itemData = item.toObject();
    delete itemData._id;
    if (!itemData.img || itemData.img === "icons/svg/item-bag.svg") {
      itemData.img = `modules/${MODULE_ID}/icons/${category === "armor" ? "armour" : category === "weapon" ? "weapon" : "equipment"}.png`;
    }
    foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.category`, category);
    foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.section`, sectionId);
    foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.slot`, `${group}.${key}`);
    foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.equipped`, sectionId === "combat");
    if (item.uuid && !item.parent) foundry.utils.setProperty(itemData, "_stats.compendiumSource", item.uuid);
    const [created] = await this.actor.createEmbeddedDocuments("Item", [itemData], { [MODULE_ID]: { fromSheet: true } });

    const row = rowFromItem(category, group, created, this.fieldsFor(group));
    if (group === "traits" && !quiet) row.name = await this._naturalAptitudeName(row.name);
    if (group === "weapons" && isMartialArts(row)) {
      const bd = martialArtsBD(this.actor.system?.attributes?.str?.value);
      if (bd !== null) row.bd = `${bd}M`;
    }
    const update = { [`system.${group}.${key}`]: row };
    if (group === "skills" && this.fieldsFor("skills").includes("xp")) {
      update[`system.${group}.${key}`].lvl = skillLevelFromXp(row.xp, this._xpMultiplier()) ?? 0;
    }
    await this.actor.update(update);
    if (!quiet) ui.notifications.info(`Added ${label} "${itemName}" to ${section.label}.`);
    this.render(false);
    return created;
  }
}

/* -------------------------------------------- */
/*  Item -> sheet sync hooks                    */
/* -------------------------------------------- */

/** Find the slot that links to an embedded item. */
function findLinkedSlot(actor, itemId) {
  for (const group of Object.keys(DEFAULT_FIELDS)) {
    const data = actor.system?.[group] ?? {};
    for (const [key, row] of Object.entries(data)) if (row?.itemId === itemId) return { group, key, row };
  }
  return null;
}

export function registerSyncHooks() {
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    if (userId !== game.user.id || options?.[MODULE_ID]?.fromSheet) return;
    const actor = item.parent;
    if (!(actor instanceof Actor)) return;
    const link = findLinkedSlot(actor, item.id);
    if (!link) return;
    const sheetClass = actor.sheet?.constructor;
    const fields = sheetClass?.layoutKey ? (LAYOUTS[sheetClass.layoutKey].fields?.[link.group] ?? DEFAULT_FIELDS[link.group]) : DEFAULT_FIELDS[link.group];
    const cells = cellsFromItem(itemCategory(item), link.group, item, fields);
    const upd = {};
    for (const [f, v] of Object.entries(cells)) if (fields.includes(f) && link.row[f] !== v) upd[`system.${link.group}.${link.key}.${f}`] = v;
    if (Object.keys(upd).length) await actor.update(upd);
  });

  Hooks.on("deleteItem", async (item, options, userId) => {
    if (userId !== game.user.id || options?.[MODULE_ID]?.fromSheet) return;
    const actor = item.parent;
    if (!(actor instanceof Actor)) return;
    const link = findLinkedSlot(actor, item.id);
    if (!link) return;
    const blankRow = Object.fromEntries(Object.keys(link.row).map(k => [k, ""]));
    await actor.update({ [`system.${link.group}.${link.key}`]: blankRow });
  });
}
