# Public repository issue-routing decision

## Decision

Agents may create or mutate GitHub issues in a public or private repository only when the human
caller authorizes that operation and the portable `vouchington-workflow:github-issue` gate verifies
the exact target immediately before the write. Repository ownership, name prefixes, and visibility
are not allowlists: live collaborator permission and operation-specific capability are authoritative.

Issue creation requires `TRIAGE`, `WRITE`, `MAINTAIN`, or `ADMIN`, enabled issues, and
`viewerCanCreateIssues`. Taxonomy-definition changes require `WRITE`, `MAINTAIN`, or `ADMIN`
plus the relevant API capability. Applying an existing label needs no separate label approval;
creating a label requires exact human approval for its repository, name, description, and color.

PR creation remains separately authorized. Credential or helper capability never grants scope.
Every write revalidates canonical repository identity and permission, and every result is read back.
The `github-issue-agent` subagent must not close, delete, or lock issues. The interactive root agent
acting as the human-facing orchestrator may close a specifically identified issue only with the
human's explicit authorization for that exact closure. The root performs this close directly and
must not delegate it. Immediately before the write, it follows the canonical mutation gate and
current-discussion and acceptance-evidence checks, then reads back the final state. This does not
authorize root deletion or locking.

## Denied external targets

Never write to a denied external target. Create or reuse a Filaments tracking issue after applying
the same live gate to Filaments, unless the human caller opts out. Include a copy-ready external
report, but redact private repository identity, paths, links, code, and findings before crossing to a
less-restricted destination; require explicit destination approval when useful redaction is
impossible.

## Consequences

- There is no static organization or public-repository allowlist to maintain.
- A collaborator permission change takes effect at the next mutation preflight.
- Existing labels and milestones remain usable without new-taxonomy approval.
- New labels require explicit approval; missing required metadata still blocks issue creation.
- Filaments keeps only its taxonomy, body, path-validation, and tracking-issue conventions locally.
