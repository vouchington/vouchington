# Development tools

- Load skills: `local-site-testing`, `infra-rules`.
- Development docs: [development index](../docs/development/README.md).
- Schema/destructive targets resolve through [`lib/db-target.sh`](lib/db-target.sh). `DATABASE_URL`
  is authoritative; non-local writes require operation-specific catalog opt-ins.
