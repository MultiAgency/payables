# Maintenance-only: no Payables application, SDK, gateway or executor code.
FROM node:24-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
RUN apt-get update && apt-get install -y --no-install-recommends acl attr && rm -rf /var/lib/apt/lists/*
COPY verify-stopped-state.mjs canonical-metadata.mjs backup.sh restore-check.sh /maintenance/
RUN chmod 0555 /maintenance/backup.sh /maintenance/restore-check.sh
WORKDIR /maintenance
USER 0
CMD ["sleep", "infinity"]
