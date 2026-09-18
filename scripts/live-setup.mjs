import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';

export async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'reference-shelf-test-'));
  const vault = path.join(root, 'Reference Shelf Test');
  const profile = path.join(root, 'profile');
  const plugin = path.join(vault, '.obsidian/plugins/reference-shelf');
  await mkdir(plugin, {recursive:true}); await mkdir(profile);
  for (const file of ['main.js','manifest.json','styles.css']) await copyFile(file,path.join(plugin,file));
  await writeFile(path.join(vault,'.obsidian/community-plugins.json'),JSON.stringify(['reference-shelf']));
  await writeFile(path.join(vault,'.obsidian/app.json'),JSON.stringify({livePreview:true,alwaysUpdateLinks:false,showUnsupportedFiles:true}));
  await writeFile(path.join(vault,'.obsidian/core-plugins.json'),'[]');
  await writeFile(path.join(vault,'.obsidian/appearance.json'),JSON.stringify({theme:'moonstone'}));
  await writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{referenceshelftest:{path:vault,ts:Date.now(),open:true}},updateDisabled:true}));
  // Use the already installed app archive, not a network download or an upgrade.
  const archive = process.env.OBSIDIAN_ASAR ?? path.join(homedir(),'Library/Application Support/obsidian/obsidian-1.13.7.asar');
  await copyFile(archive,path.join(profile,path.basename(archive)));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400" fill="#faf8f5"/><path d="M80 300H1120M160 340V60" stroke="#5f554a" stroke-width="3"/><path d="M100 300Q500 280 700 180T1080 80" stroke="#b07b45" stroke-width="6" fill="none"/><text x="220" y="90" fill="#5f554a" font-size="28">Reference Shelf · local test image</text></svg>';
  await writeFile(path.join(vault,'wide.svg'),svg);
  await writeFile(path.join(vault,'other.svg'),svg.replace('local test image','second reference'));
  await writeFile(path.join(vault,'broken.png'),'not an image');
  const note = '# Reference Shelf acceptance\n\n![[wide.svg]]\n\n![Second](other.svg)\n\n![[broken.png]]\n\n'+Array.from({length:100},(_,i)=>`## Section ${i+1}\n\nRead this explanation while keeping the reference in sight. The image must remain fixed above this independently scrolling text.\n\n`).join('');
  await writeFile(path.join(vault,'A.md'),note);
  await writeFile(path.join(vault,'B.md'),'# Another note\n\n![[other.svg]]\n\nThis note has its own pin.\n');
  return {root,vault,profile,note};
}
