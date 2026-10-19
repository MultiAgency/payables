// The SDK dependency spec decides the mode: `link:` for development against Proto's SDK checkout, or the vendored
// tarball for a release candidate. Release steps (release:stage, Docker images) run only on a release candidate.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SDK = '@multiagency/sdk';
const root = new URL('../', import.meta.url);

export function sdkMode() {
  const spec = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).dependencies?.[SDK] ?? '';
  if (spec.startsWith('link:')) return { mode: 'dev', spec };
  const tarball = spec.match(/^file:vendor\/(multiagency-sdk-[\d.]+\.tgz)$/)?.[1];
  if (tarball) return { mode: 'release', spec, tarball };
  throw new Error(`${SDK} must be a link: (development) or file:vendor/multiagency-sdk-<version>.tgz (release), not ${JSON.stringify(spec)}`);
}

/** A release candidate whose vendored tarball is the one `vendor/contract-pin.json` pins, byte for byte. */
export function requireRelease() {
  const current = sdkMode();
  if (current.mode !== 'release') throw new Error(`dev link: build from a release candidate (${SDK} is ${current.spec})`);
  const pin = JSON.parse(readFileSync(new URL('vendor/contract-pin.json', root), 'utf8'));
  const sha256 = createHash('sha256').update(readFileSync(new URL(`vendor/${current.tarball}`, root))).digest('hex');
  if (pin.package !== SDK || pin.tarball !== current.tarball || pin.sha256 !== sha256)
    throw new Error(`vendor/${current.tarball} is not the pinned ${SDK} (sha256 ${sha256}, pinned ${pin.tarball} ${pin.sha256})`);
  return current;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(`${SDK}: ${requireRelease().tarball}`); } catch (error) { console.error(error.message); process.exit(1); }
}
