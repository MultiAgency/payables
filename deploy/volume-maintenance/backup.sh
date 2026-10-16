#!/bin/sh
# Only invoke after the original gateway AND all writers have stopped.
set -eu
umask 077
[ "$#" -eq 1 ] || { echo 'Usage: backup.sh WINDOW_ID' >&2; exit 2; }
case "$1" in ''|*[!a-z0-9-]*) echo 'Invalid WINDOW_ID' >&2; exit 2;; esac
[ -d /data ] && [ ! -L /data ] || { echo '/data must be the retained volume' >&2; exit 1; }
[ ! -e /app/src ] || { echo 'Application code must not be present' >&2; exit 1; }
OUT=/tmp/payables-volume-backup/$1
mkdir -p /tmp/payables-volume-backup
mkdir -m 700 "$OUT"
node /maintenance/verify-stopped-state.mjs snapshot /data "$OUT/stopped-tree.json"
(cd /data && getfacl -R -P -n .) > "$OUT/acl.raw"
node /maintenance/canonical-metadata.mjs "$OUT/acl.raw" "$OUT/acl.txt"
(cd /data && getfattr -R -P -h -d -m- --encoding=hex .) > "$OUT/xattrs.raw"
node /maintenance/canonical-metadata.mjs "$OUT/xattrs.raw" "$OUT/xattrs.txt"
tar --format=pax --numeric-owner --acls --xattrs --xattrs-include='*' --one-file-system \
  --atime-preserve=system -cpf "$OUT/whole-volume.tar" -C /data .
# Catch unexpected content/ownership/mode/link changes while copying; not a substitute for stopping writers.
node /maintenance/verify-stopped-state.mjs compare /data "$OUT/stopped-tree.json"
(cd /data && getfacl -R -P -n .) > "$OUT/acl-after.raw"
node /maintenance/canonical-metadata.mjs "$OUT/acl-after.raw" "$OUT/acl-after.txt"
(cd /data && getfattr -R -P -h -d -m- --encoding=hex .) > "$OUT/xattrs-after.raw"
node /maintenance/canonical-metadata.mjs "$OUT/xattrs-after.raw" "$OUT/xattrs-after.txt"
cmp "$OUT/acl.txt" "$OUT/acl-after.txt"
cmp "$OUT/xattrs.txt" "$OUT/xattrs-after.txt"
(cd "$OUT" && sha256sum whole-volume.tar stopped-tree.json acl.txt xattrs.txt) > "$OUT/SHA256SUMS"
printf 'PASS: stopped-volume backup created in %s; preserve whole-volume.tar, stopped-tree.json, acl.txt, xattrs.txt and SHA256SUMS privately\n' "$OUT"
