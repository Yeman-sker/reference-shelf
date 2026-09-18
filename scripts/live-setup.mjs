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
  const composite = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="660" viewBox="0 0 1000 660">
  <rect width="1000" height="660" fill="#faf8f5"/>
  <g font-family="sans-serif" fill="#433e38"><text x="30" y="44" font-size="28">Two panels · two different limits</text>
  <text x="30" y="76" font-size="20">Compare the approach values with the value at the point.</text>
  <rect x="30" y="100" width="450" height="520" rx="8" fill="white" stroke="#ddd6ce"/>
  <rect x="520" y="100" width="450" height="520" rx="8" fill="white" stroke="#ddd6ce"/>
  <text x="54" y="140" font-size="26" fill="#277983">A · Same approach height</text>
  <text x="544" y="140" font-size="26" fill="#a66c32">B · Different approach heights</text>
  <path d="M90 500H450M150 535V190M575 500H915M635 535V190" fill="none" stroke="#7a746c" stroke-width="2"/>
  <path d="M230 205V510M715 205V510" stroke="#ddd6ce" stroke-dasharray="5 7"/>
  <path d="M90 475L430 280M575 420H715M715 320H915" stroke="#277983" fill="none" stroke-width="4"/>
  <g stroke="#277983" fill="white" stroke-width="3"><circle cx="230" cy="395" r="7"/><circle cx="715" cy="420" r="7"/><circle cx="715" cy="320" r="7"/></g>
  <g fill="#a66c32"><circle cx="230" cy="230" r="7"/><circle cx="715" cy="230" r="7"/></g>
  <g font-size="23"><text x="246" y="222">(1, 5) actual value</text><text x="731" y="222">(1, 5) actual value</text>
  <text x="260" y="425" fill="#277983">Approaches 2</text><text x="742" y="305" fill="#277983">Right → 3</text>
  <text x="547" y="450" fill="#277983">Left → 1</text><text x="221" y="533">1</text><text x="707" y="533">1</text>
  <text x="54" y="572">g(1) = 5; limit = 2</text><text x="544" y="572">h(1) = 5; limit does not exist</text></g>
  </g></svg>`;
  await writeFile(path.join(vault,'composite.svg'),composite);
  const note = '# Functions and limits\n\n![[composite.svg]]\n\n![[wide.svg]]\n\n![Second](other.svg)\n\n![[broken.png]]\n\n'+Array.from({length:100},(_,i)=>`## Section ${i+1}: compare the two panels\n\nPanel A approaches the same height from both directions. The filled point records the actual function value, while the open point records an excluded point on the curve. Keep the left reference visible while following this explanation.\n\nPanel B approaches different heights from the left and right. Changing the filled point does not make those approaches equal. Compare both panels without leaving this passage.\n\n`).join('');
  await writeFile(path.join(vault,'A.md'),note);
  await writeFile(path.join(vault,'B.md'),'# Another note\n\n![[other.svg]]\n\nThis note has its own pin.\n');
  return {root,vault,profile,note};
}
