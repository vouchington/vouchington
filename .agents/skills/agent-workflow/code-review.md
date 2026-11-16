# Code review

## Local self-review

- Review the final diff against the saved plan and linked requirements. Use an independent
  read-only reviewer for substantive, cross-cutting, security-sensitive, or uncertain changes.
  Mechanical edits may use a direct diff check.
- Return severity-ordered findings with file/line evidence. Separate blockers from optional
  improvements; when no findings exist, state residual validation limits.
- Read applicable local instructions independently. For storage changes, check
  [prelaunch relational policy](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage):
  joined ids and UUID arrays of entity ids have target foreign keys; structured documents, data
  points, and change history stay JSON. An id that appears only in change history does not get a
  foreign key. An existing pattern or accepted plan does not waive schema, authorization, or parity
  constraints.
- Human direction and the accepted plan outrank advisory reviews. Record material changes with the
  existing plan or PR; a separate Plan issue is not required.
- Follow canonical review-response guidance for dispositions. Keep the description accurate, and
  do not substitute cosmetic review churn for correctness or required validation.

## Automated review

- Automated review is advisory. CI and human merge authority remain independent; request another
  review only after material changes to the reviewed code.
- If a check exposes no accessible findings, annotations, or logs, report that limitation instead
  of treating the badge as actionable feedback.
- Bot-noise configuration belongs to `.pr-shepherd/classification/` and `.pr-shepherdrc.yml`.
  Read the [upstream classification guide](https://github.com/jonathanong/pr-shepherd/blob/main/docs/configuration.md)
  before changing it; do not copy the current exception inventory into workflow instructions.
