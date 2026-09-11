# Rename Audit

[Back to Dev Environment Reference](README.md#rename-audit)

Before committing env var, secret, infrastructure, CI/deploy, or package-boundary renames, run:

```bash
./dev/audit-rename OLD_NAME NEW_NAME
```

The helper is a repo-wide `rg --fixed-strings --hidden` scan that honors ignore rules while
skipping `.git/`. It groups old-name and new-name matches by app, CI/dev, infra, config, docs, and
other paths. Classify every old-name hit as intended, unrelated, or fix-required before the rename
lands.

For broader env-var and Dynamic Config migrations, run:

```bash
./dev/config-inventory
./dev/config-inventory --format json
```

The generated inventory classifies env vars and lists readers, local setup, infrastructure/deploy
contracts, workflow env blocks, docs references, package-manager gates, and DynamicConfig registry
coverage.
