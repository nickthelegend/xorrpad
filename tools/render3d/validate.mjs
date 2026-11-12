import { readFile, writeFile } from "node:fs/promises";
import { validateBytes } from "gltf-validator";
const reports = [];
for (const name of ["xorrpad.glb", "xorrpad-exploded.glb"]) {
  const bytes = await readFile(
    new URL("../../desk/app/public/models/" + name, import.meta.url),
  );
  const r = await validateBytes(bytes, { uri: name });
  reports.push({
    file: name,
    bytes: bytes.length,
    validatorVersion: r.validatorVersion,
    issues: r.issues,
  });
  if (r.issues.numErrors || bytes.length >= 3 * 1024 * 1024)
    process.exitCode = 1;
}
await writeFile(
  new URL("../../cad/WEB-MODEL-VALIDATION.json", import.meta.url),
  JSON.stringify(reports, null, 2) + "\n",
);
console.log(
  reports
    .map(
      (r) =>
        `${r.file}: ${r.bytes} bytes; ${r.issues.numErrors} errors, ${r.issues.numWarnings} warnings`,
    )
    .join("\n"),
);
