// Extract every LevelDB pack in ./packs into JSON source under ./src/packs/<name>.json
// Usage: node tools/extract-packs.mjs [packName ...]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ClassicLevel } from "./level.mjs";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);
for (const name of fs.readdirSync(path.join(root, "packs"))) {
  if (only.length && !only.includes(name)) continue;
  // Copy to a temp dir so a running Foundry's LOCK file is never touched
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atow-pack-"));
  fs.cpSync(path.join(root, "packs", name), tmp, { recursive: true });
  fs.rmSync(path.join(tmp, "LOCK"), { force: true });
  const db = new ClassicLevel(tmp, { keyEncoding: "utf8", valueEncoding: "utf8" });
  await db.open();
  const rows = [];
  for await (const [k, v] of db.iterator()) rows.push({ _key: k, ...JSON.parse(v) });
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  rows.sort((a, b) => a._key.localeCompare(b._key));
  fs.writeFileSync(path.join(root, "src", "packs", `${name}.json`), JSON.stringify(rows, null, 1) + "\n");
  console.log(`extracted ${name}: ${rows.length} records`);
}
