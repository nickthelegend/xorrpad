import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { appDataDir } from "./permissions.mjs";
export class Profiles {
  constructor(pad, { dir = appDataDir() } = {}) {
    this.pad = pad;
    this.file = path.join(dir, "device-profiles.json");
  }
  read() {
    try {
      return JSON.parse(readFileSync(this.file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      return { active: "Custom", profiles: { Custom: this.pad.keymap.keys } };
    }
  }
  save(value) {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file + ".tmp", JSON.stringify(value), { mode: 0o600 });
    renameSync(this.file + ".tmp", this.file);
  }
  capture() {
    const s = this.read();
    s.profiles[s.active] = this.pad.keymap.keys;
    this.save(s);
  }
  select(name) {
    if (!["Scalper", "Swing", "Predictor", "Custom"].includes(name))
      throw Error("invalid profile");
    const s = this.read();
    s.profiles[s.active] = this.pad.keymap.keys;
    let keys = s.profiles[name];
    if (!keys) {
      const presets = {
        Scalper: ["momentum", "grid", "buy", "sell", "risk", "portfolio"],
        Swing: ["dca", "rebalance", "risk", "yield", "portfolio", "base"],
        Predictor: ["base", "risk", "portfolio", "grid", "dca", "rebalance"],
      };
      keys = this.pad.keymap.keys.map((k, i) =>
        i < 6
          ? {
              ...k,
              action: presets[name][i],
              label: presets[name][i].toUpperCase(),
            }
          : k,
      );
    }
    const map = this.pad.setKeymap({
      revision: this.pad.keymap.revision + 1,
      keys,
    });
    s.active = name;
    s.profiles[name] = map.keys;
    this.save(s);
    return { ...s, keymap: map };
  }
}
