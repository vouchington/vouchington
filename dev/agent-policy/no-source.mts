// pr_create, pr_update, and pr_validate take `noSourceIssue: { reason }` and render this
// statement under `## Related issues`. Each reason maps to one of the exact no-source pairs the
// body policy accepts (validate-body.mts); the policy still decides whether the pair is allowed,
// for example that a direct user request is interactive only.
const STATEMENTS = new Map([
  [
    'direct user request',
    'No source issue; direct user request.\n<!-- related-issues-validation: no-source-direct-request -->',
  ],
  [
    'scheduled prompt run',
    'No source issue; scheduled prompt run.\n<!-- related-issues-validation: no-source-scheduled-prompt -->',
  ],
])

export type NoSourceIssue = { reason: string }

export function renderNoSourceIssue({ reason }: NoSourceIssue): string {
  return STATEMENTS.get(reason) ?? `- No source issue — ${reason}`
}

export function noSourceIssueErrors(noSourceIssue: NoSourceIssue | undefined): string[] {
  if (noSourceIssue === undefined || STATEMENTS.has(noSourceIssue.reason)) return []
  const reasons = [...STATEMENTS.keys()].map(reason => JSON.stringify(reason)).join(' or ')
  return [
    `noSourceIssue.reason must be ${reasons}; got ${JSON.stringify(noSourceIssue.reason)}. Otherwise link the source issue in relatedIssues.`,
  ]
}
