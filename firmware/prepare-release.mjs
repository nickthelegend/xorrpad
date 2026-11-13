// MIT · Copyright (c) 2026 Nivesh Gajengi
// Public image bytes only. Deliberately no signing or key-file input.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {releaseMetadata} from './release-manifest.mjs';
const [imageFile,outputFile]=process.argv.slice(2);
if(!imageFile || !outputFile)throw Error('Usage: node firmware/prepare-release.mjs app.bin manifest.unsigned.json');
const manifest=releaseMetadata(await readFile(imageFile));
await mkdir(path.dirname(outputFile),{recursive:true});
await writeFile(outputFile,JSON.stringify(manifest,null,2)+'\n');
console.log(`Unsigned ${manifest.version}: ${manifest.size} bytes; ${manifest.sha256}`);
