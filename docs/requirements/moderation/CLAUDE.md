# Moderation docs — sync invariant

These docs are guard-pinned. When editing any of them, keep the following files in sync:

- `MODERATION-POLICY-MATRIX.md` — policy keys, labels, severity, recommended actions
- `REPORTING.md` — report entity types, reason codes, moderation queue
- `MODERATION-FLOWS.md` — canonical pipeline and subsystem index
- `ACTIONS.md` (in `../navigation/`) — report-table action matrix
- `REPORT-JUDGEMENTS.md` — AI recommendations and human review

Enforcement: `static-code-analysis/repo-file-policy/moderation-policy-doc-sync-guard.mts`
