/**
 * Item sheet for the ported Fantasy Grounds items (worldbuilding "item" type with system.props).
 * Shows the category-specific stat block as editable fields.
 */
import { MODULE_ID, ATTRIBUTE_LABELS } from "./rules.js";
import { CATEGORIES, CATEGORY_LABELS, itemCategory } from "./slots.js";

const BaseItemSheet = foundry.appv1?.sheets?.ItemSheet ?? globalThis.ItemSheet;
const TextEditorImpl = () => foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

/** Stat fields per category: [prop key, label, input type] */
const PROP_FIELDS = {
  skill: [["a1", "Link 1", "attr"], ["a2", "Link 2", "attr"], ["tn", "Target Number", "number"], ["c", "Complexity (SB/SA/CB/CA)", "text"]],
  trait: [["tp", "Trait Points (TP)", "number"]],
  weapon: [["item", "Item", "text"], ["equipment ratings", "Equipment Ratings", "text"], ["damage type", "Damage Type", "text"],
    ["ap", "AP", "number"], ["bd", "BD", "number"], ["rof", "ROF", "number"], ["range", "Range (S/M/L/E)", "text"],
    ["shots", "Shots", "number"], ["special", "Special", "text"], ["mass", "Mass (kg)", "number"], ["cost", "Cost (C-bills)", "number"],
    ["affiliation", "Affiliation", "text"]],
  armor: [["item", "Item", "text"], ["equipment ratings", "Equipment Ratings", "text"], ["coverage", "Coverage", "text"],
    ["m", "BAR: Melee", "number"], ["b", "BAR: Ballistic", "number"], ["e", "BAR: Energy", "number"], ["x", "BAR: Explosive", "number"],
    ["mass", "Mass (kg)", "number"], ["cost", "Cost (C-bills)", "number"], ["patch cost", "Patch Cost", "number"], ["affiliation", "Affiliation", "text"]],
  equipment: [["item", "Item", "text"], ["equipment ratings", "Equipment Ratings", "text"], ["mass", "Mass (kg)", "number"],
    ["cost", "Cost (C-bills)", "number"], ["affiliation", "Affiliation", "text"]]
};
const NOTES_FIELD = { skill: "description", trait: "description", weapon: "notes", armor: "notes", equipment: "notes" };

export class ATOWItemSheet extends BaseItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["atow", "sheet", "item", "atow-item-sheet"],
      template: `modules/${MODULE_ID}/templates/atow-item-sheet.html`,
      width: 560,
      height: 620,
      resizable: true,
      submitOnChange: true
    });
  }

  async getData(options) {
    const context = await super.getData(options);
    const item = this.item;
    const category = itemCategory(item);
    const props = item.system?.props ?? {};
    context.item = item;
    context.moduleId = MODULE_ID;
    context.category = category;
    context.categories = CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABELS[c], selected: c === category }));
    context.categoryLabel = CATEGORY_LABELS[category] ?? "Uncategorised";
    context.attrOptions = Object.entries(ATTRIBUTE_LABELS);
    context.fields = (PROP_FIELDS[category] ?? []).map(([key, label, type]) => ({
      key, label, type, name: `system.props.${key}`, value: props[key] ?? "",
      options: type === "attr" ? [["", "—"], ...Object.entries(ATTRIBUTE_LABELS).map(([k, l]) => [k === "rfl" ? "ref" : k, l])]
        .map(([v, l]) => ({ value: v, label: l, selected: String(props[key] ?? "").toLowerCase() === v || (v === "ref" && props[key] === "rfl") })) : null
    }));
    const notesKey = NOTES_FIELD[category];
    context.notesName = notesKey ? `system.props.${notesKey}` : null;
    context.notes = notesKey ? (props[notesKey] ?? "") : "";
    const TE = TextEditorImpl();
    context.enrichedNotes = await TE.enrichHTML(context.notes || "", { relativeTo: item });
    context.enrichedDescription = await TE.enrichHTML(item.system?.description ?? "", { relativeTo: item });
    context.editable = this.isEditable;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;
    html.find('select[name="flags.' + MODULE_ID + '.category"]').on("change", ev => {
      this.item.setFlag(MODULE_ID, "category", ev.currentTarget.value);
    });
  }

  /** Keep numeric props numeric and mirror the item name into props.name. */
  async _updateObject(event, formData) {
    for (const [k, v] of Object.entries(formData)) {
      if (!k.startsWith("system.props.")) continue;
      const field = Object.values(PROP_FIELDS).flat().find(f => `system.props.${f[0]}` === k);
      if (field?.[2] === "number" && v !== "" && v !== null && !isNaN(v)) formData[k] = Number(v);
    }
    if (formData.name) formData["system.props.name"] = formData.name;
    return super._updateObject(event, formData);
  }
}
