import { readFileSync, writeFileSync } from 'node:fs';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: canonical-metadata.mjs INPUT OUTPUT');
const blocks = readFileSync(input, 'utf8').trimEnd().split(/\n\n+/).filter(Boolean).sort();
writeFileSync(output, blocks.length ? blocks.join('\n\n') + '\n' : '', { mode: 0o600, flag: 'wx' });
