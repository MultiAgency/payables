#!/bin/sh
# Read-only backup mounted at /backup; fresh disposable writable scratch at /restore.
# Never mount the production volume into this container.
set -eu
umask 077
[ "$#" -eq 0 ] || { echo 'Usage: restore-check.sh' >&2; exit 2; }
[ ! -e /data/state ] || { echo 'Production volume must not be mounted' >&2; exit 1; }
[ -d /restore ] && [ ! -L /restore ] || { echo '/restore must be a real scratch directory' >&2; exit 1; }
[ -z "$(ls -A /restore)" ] || { echo 'Scratch restore directory must be empty' >&2; exit 1; }
(cd /backup && sha256sum -c SHA256SUMS)
tar --numeric-owner --same-owner --same-permissions --acls --xattrs --xattrs-include='*' \
  -xpf /backup/whole-volume.tar -C /restore
node /maintenance/verify-stopped-state.mjs compare /restore /backup/stopped-tree.json
(cd /restore && getfacl -R -P -n .) > /tmp/restored-acl.raw
node /maintenance/canonical-metadata.mjs /tmp/restored-acl.raw /tmp/restored-acl.txt
(cd /restore && getfattr -R -P -h -d -m- --encoding=hex .) > /tmp/restored-xattrs.raw
node /maintenance/canonical-metadata.mjs /tmp/restored-xattrs.raw /tmp/restored-xattrs.txt
cmp /backup/acl.txt /tmp/restored-acl.txt
cmp /backup/xattrs.txt /tmp/restored-xattrs.txt
node /maintenance/verify-stopped-state.mjs sqlite /restore
(cd /backup && sha256sum -c SHA256SUMS)
printf 'PASS: isolated restore matches bytes, numeric ownership, modes, links, ACLs, xattrs and SQLite checks\n'
