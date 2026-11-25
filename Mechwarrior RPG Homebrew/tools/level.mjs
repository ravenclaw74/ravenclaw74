// Shared helper: load classic-level (the LevelDB binding Foundry itself uses).
// Uses FOUNDRY_APP env var or the default Windows install path, so no npm install is needed.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const candidates = [
  process.env.FOUNDRY_APP,
  "C:/Program Files/Foundry Virtual Tabletop/resources/app",
  "/opt/foundryvtt/resources/app",
  "/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app"
].filter(Boolean);
let ClassicLevel;
try { ({ ClassicLevel } = require("classic-level")); } catch {
  for (const c of candidates) {
    try { ({ ClassicLevel } = require(path.join(c, "node_modules", "classic-level"))); break; } catch {}
  }
}
if (!ClassicLevel) throw new Error("classic-level not found. Set FOUNDRY_APP to your Foundry 'resources/app' folder.");
export { ClassicLevel };
