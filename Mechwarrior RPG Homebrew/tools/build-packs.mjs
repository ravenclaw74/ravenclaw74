// Compile ./src/packs/<name>.json into fresh LevelDB packs under ./packs/<name>
// Usage: node tools/build-packs.mjs [packName ...]   (close Foundry first)
import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "./level.mjs";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);
for (const file of fs.readdirSync(path.join(root, "src", "packs"))) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -5);
  if (only.length && !only.includes(name)) continue;
  const rows = JSON.parse(fs.readFileSync(path.join(root, "src", "packs", file), "utf8"));
  const dest = path.join(root, "packs", name);
  fs.rmSync(dest, { recursive: true, force: true });
  const db = new ClassicLevel(dest, { keyEncoding: "utf8", valueEncoding: "utf8" });
  await db.open();
  const batch = db.batch();
  for (const { _key, ...doc } of rows) {
    if (!_key) throw new Error(`${name}: record without _key`);
    batch.put(_key, JSON.stringify(doc));
  }
  await batch.write();
  await db.compactRange("\x00", "\xff");
  await db.close();
  fs.rmSync(path.join(dest, "LOCK"), { force: true });
  console.log(`built ${name}: ${rows.length} records`);
}
