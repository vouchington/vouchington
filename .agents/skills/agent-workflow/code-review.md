# Code review

## Local self-review

- Review the final diff against the saved plan and linked requirements. Use an independent
  read-only reviewer for substantive, cross-cutting, security-sensitive, or uncertain changes.
  Mechanical edits may use a direct diff check.
- Return severity-ordered findings with file/line evidence. Separate blockers from optional
  improvements; when no findings exist, state residual validation limits.
- Read applicable local instructions independently. For storage changes, check
  [prelaunch relational policy](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage).
  An existing pattern or accepted plan does not waive schema, authorization, or parity constraints.
- Human direction and the accepted plan outrank advisory reviews. Record material changes with the
  existing plan or PR; a separate Plan issue is not required.
- Follow canonical review-response guidance for dispositions. Keep the description accurate, and
  do not substitute cosmetic review churn for correctness or required validation.

## Agent-authored PR creation feedback

- In an authorized triage flow, assess verified agent-authored PRs for description quality,
  root-cause completeness, scope, validation, and useful handoff context. Skip unknown provenance.
- Resolve the producing prompt or skill from durable metadata: scheduled PRs name their exact
  prompt; auto-fix and security PRs identify their corresponding template or triage skill.
  Do not infer a source from a similar filename.
- Each recommendation names the PR, concrete evidence, verified source, preventive change, and
  whether the finding recurs. Group repeated causes for [retrospective](../retrospective/SKILL.md).
- Source changes require the calling workflow's authority. [PR triage](../triage-prs/SKILL.md)
  owns its bounded feedback-PR behavior; [ready-and-shepherd](../ready-and-shepherd/SKILL.md)
  stays a mechanical handoff.

## Automated review

- The [review prompt](code-review-prompt.md) is advisory. CI and human merge authority remain
  independent; request another review only after material changes to the reviewed code.
- If a check exposes no accessible findings, annotations, or logs, report that limitation instead
  of treating the badge as actionable feedback.
- Bot-noise configuration belongs to `.pr-shepherd/classification/` and `.pr-shepherdrc.yml`.
  Read the [upstream classification guide](https://github.com/jonathanong/pr-shepherd/blob/main/docs/configuration.md)
  before changing it; do not copy the current exception inventory into workflow instructions.
