# Vouchington retrospective document

The canonical `vouchington-workflow:retrospective` skill owns MCP composition, preview, saving,
outbox delivery, and evidence minimization. This file records only the Vouchington document shape
validated by [`validateRetroDoc`](../../../dev/retrospective-validate.mts) and
[`validateRetrospective`](../../../dev/agent-policy.mts).

The front matter uses JSON values for `date`, `description`, `issues`, `prs`, `session_id`,
`repositories`, `work_outcome`, and `feedback_coverage`. The composer writes them; if authoring
manually, unquoted YAML dates, block arrays, unrelated keys, and a partial outcome/coverage pair
are rejected. The title is `# Retrospective: PR #s - [session description]`.

Required body sections, in order:

```markdown
## Outcome

## Verifiable Facts

## Transcript Facts

## CI Failures

Status: <failures observed|none observed|unavailable (reason)>

## Findings

## Tool Findings

Status: <findings|none observed (scope)|not assessed (reason)|unavailable (reason)>

## Architecture Findings

Status: <findings|none observed (scope)|not assessed (reason)|unavailable (reason)>

## Sandbox & Permission Audit
```

`## Plan vs Actual`, `## Scheduled Prompt Suggestions`, and `## PR Creation Feedback` appear
only when applicable. For the failure and assessment grammar see [fact contracts](fact-contracts.md);
for PR creation feedback see [PR feedback](pr-feedback.md). The composer derives CI failures and
the sandbox audit from hosted journal entries, so unavailable evidence stays unavailable. The
local validator decides a mismatch between this page and code.
