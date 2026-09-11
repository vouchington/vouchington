# Verifying a Renovate change

[Back to Dependency Updates](dependency-updates.md#verifying-a-renovate-change)

Run a dry-run from any worktree without committing or installing the app locally:

```bash
LOG_LEVEL=debug npx --yes renovate --platform=local --print-config 2>&1 | rg "currentValue|depName|fileMatch"
```

Mend's hosted runner refreshes on a schedule defined by the app; force a refresh from the Mend dashboard if a version literal changed and you want to see the proposed PR sooner.
