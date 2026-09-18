import * as esbuild from 'esbuild';
const options = {entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian'], format: 'cjs', target: 'es2022', platform: 'browser', outfile: 'main.js', logLevel: 'info', sourcemap: process.argv.includes('--watch') ? 'inline' : false};
if (process.argv.includes('--watch')) { const ctx = await esbuild.context(options); await ctx.watch(); } else { await esbuild.build(options); }
