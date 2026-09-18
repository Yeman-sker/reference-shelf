import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Version mismatch');
const files = ['main.js','manifest.json','styles.css','LICENSE'];
await mkdir('dist/reference-shelf', {recursive:true});
const entries = {};
for (const file of files) {
  const bytes = await readFile(file);
  if (!bytes.length) throw new Error('Empty artifact: '+file);
  entries['reference-shelf/'+file] = bytes;
  await copyFile(file,'dist/reference-shelf/'+file);
}
const zip = zipSync(entries, {level:9});
const unpacked = unzipSync(zip);
for (const [file,bytes] of Object.entries(entries)) {
  if (!Buffer.from(unpacked[file]).equals(bytes)) throw new Error('ZIP verification failed: '+file);
}
const name = `reference-shelf-${manifest.version}.zip`;
await writeFile('dist/'+name,zip);
const hash = createHash('sha256').update(zip).digest('hex');
await writeFile('dist/SHA256SUMS',hash+'  '+name+'\n');
console.log(JSON.stringify({artifact:'dist/'+name,bytes:zip.length,sha256:hash,files:Object.keys(entries)},null,2));
