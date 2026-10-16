// Offline maintenance helper. Never starts application code or follows state symlinks.
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { closeSync, lstatSync, openSync, readSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import assert from 'node:assert/strict';

const [action, directory, manifestFile] = process.argv.slice(2);
if (!['snapshot', 'compare', 'sqlite'].includes(action) || !directory || action !== 'sqlite' && !manifestFile)
  throw Error('Usage: node verify-stopped-state.mjs snapshot|compare ROOT MANIFEST | sqlite ROOT');
const root = resolve(directory);
assert.ok(lstatSync(root).isDirectory(), 'Root must be a real directory, not a symlink');
const entries = {};
const links = new Map();
function scan(path, name) {
  const stat = lstatSync(path);
  const entry = { mode: stat.mode & 0o7777, uid: stat.uid, gid: stat.gid };
  if (stat.isSymbolicLink()) Object.assign(entry, { type: 'symlink', target: readlinkSync(path) });
  else if (stat.isDirectory()) {
    entry.type = 'directory';
    entries[name] = entry;
    for (const child of readdirSync(path).sort()) scan(join(path, child), name === '.' ? child : `${name}/${child}`);
    return;
  } else if (stat.isFile()) {
    const hash = createHash('sha256');
    const descriptor = openSync(path, 'r');
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      let length;
      while ((length = readSync(descriptor, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length));
    } finally { closeSync(descriptor); }
    Object.assign(entry, { type: 'file', size: stat.size, sha256: hash.digest('hex') });
    if (stat.nlink > 1) {
      const id = `${stat.dev}:${stat.ino}`;
      if (!links.has(id)) links.set(id, name);
      entry.hardlinkGroup = links.get(id);
    }
  } else throw Error(`Unsupported retained file type: ${name}; resolve before release`);
  entries[name] = entry;
}
scan(root, '.');
if (action === 'snapshot') {
  const output = resolve(manifestFile);
  const within = relative(root, output);
  if (!within || !within.startsWith('..') && !within.startsWith('/')) throw Error('Manifest must be outside the state tree');
  writeFileSync(output, JSON.stringify({ version: 1, entries }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(`PASS: stopped-tree manifest created (${Object.keys(entries).length} entries)`);
} else if (action === 'compare') {
  const expected = JSON.parse(readFileSync(manifestFile, 'utf8'));
  assert.equal(expected.version, 1);
  assert.deepEqual(entries, expected.entries, 'Restored content, ownership, modes, links or retained paths differ');
  console.log(`PASS: restored tree matches (${Object.keys(entries).length} entries)`);
} else {
  let databases = 0;
  const databasePaths = new Set();
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.type !== 'file') continue;
    const namedDatabase = /\.(sqlite|sqlite3|db)$/i.test(name);
    if (entry.size < 16) {
      if (namedDatabase) throw Error(`Truncated database: ${name}`);
      continue;
    }
    const descriptor = openSync(join(root, name), 'r');
    const header = Buffer.alloc(16);
    try { readSync(descriptor, header, 0, 16, 0); } finally { closeSync(descriptor); }
    if (!header.equals(Buffer.from('SQLite format 3\0'))) {
      if (namedDatabase) throw Error(`Unrecognized database header: ${name}; preserve and investigate`);
      continue;
    }
    databasePaths.add(name);
    const db = new DatabaseSync(join(root, name), { readOnly: true });
    try {
      const result = db.prepare('PRAGMA quick_check').all();
      assert.ok(result.length > 0 && result.every(row => Object.values(row)[0] === 'ok'), `SQLite integrity check failed: ${name}`);
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, `SQLite foreign-key check failed: ${name}`);
    } finally { db.close(); }
    databases++;
  }
  for (const [name, entry] of Object.entries(entries))
    if (entry.type === 'file' && /-(wal|shm)$/.test(name) && !databasePaths.has(name.replace(/-(wal|shm)$/, '')))
      throw Error(`Unpaired SQLite sidecar: ${name}; preserve and investigate`);
  console.log(`PASS: ${databases} SQLite databases checked read-only; retained sidecars paired`);
}
