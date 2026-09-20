/**
 * env.mjs — load the repo's .env BEFORE anything that reads it.
 *
 * This has to be its own module, imported first. ES imports are all evaluated
 * before the importing module's body runs, so a `loadEnvFile()` call inside
 * verify.mjs happens *after* chain.mjs has already read AGENT_PRIVATE_KEY at
 * module scope — and the suite then ran against anvil's default account with no
 * balance, reporting a working product as broken.
 *
 * Anything already exported in the environment wins, so a caller can still
 * override a single value for one run.
 */
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch { /* no .env — the checks that need one say so */ }
