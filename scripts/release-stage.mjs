// Stages the built owner app as one immutable release with Proto's shared release server (P2 D5).
// The release holds exactly what the manifest declares: its entries, contract.json and the hashed
// static assets. Files the build emits but this app does not ship (for example the supplier page,
// now owned by Invoices) are left out. Prints the release id (the directory digest).
//
//   RELEASES_ROOT=/abs/releases node scripts/release-stage.mjs [web/dist]
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stage } from '@multiagency/sdk/release-server';
import { requireRelease } from './release-mode.mjs';

// A release holds the vendored SDK it was built and checked against, never a dev link.
requireRelease();

const root = process.env.RELEASES_ROOT;
if (!root) throw new Error('Set RELEASES_ROOT to the release directory root');
const built = resolve(process.argv[2] ?? 'web/dist');
const contract = JSON.parse(readFileSync(join(built, 'contract.json'), 'utf8'));
if (contract.version !== 1 || contract.product !== 'payables') throw new Error('web/dist/contract.json is not a Payables v1 manifest');
const files = new Set(['contract.json', ...Object.values(contract.entries), ...(contract.fallback ? [contract.fallback] : [])]);

const input = mkdtempSync(join(tmpdir(), 'payables-release-'));
try {
  for (const file of files) cpSync(join(built, file), join(input, file));
  cpSync(join(built, 'static'), join(input, 'static'), { recursive: true });
  console.log(stage(resolve(root), input));
} finally { rmSync(input, { recursive: true, force: true }); }
