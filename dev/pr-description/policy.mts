import {
  DEFAULT_PROVENANCE_RULES,
  hasRelatedIssuesNoSourcePair,
  type NoSourceLinePairTemplate,
  type PartialBatchTemplate,
  type PrBodyValidationPolicy,
} from 'vouchington-tooling/pr-description'

export const DIRECT_USER_REQUEST_NO_SOURCE_TEMPLATE: NoSourceLinePairTemplate = {
  visibleLine: 'No source issue; direct user request.',
  marker: '<!-- related-issues-validation: no-source-direct-request -->',
}

export const SCHEDULED_PROMPT_NO_SOURCE_TEMPLATE: NoSourceLinePairTemplate = {
  visibleLine: 'No source issue; scheduled prompt run.',
  marker: '<!-- related-issues-validation: no-source-scheduled-prompt -->',
  requiredBodyLines: new Set(['Workspace setup: Triage loop scheduled prompt']),
}

export const PARTIAL_BATCH_TEMPLATE: PartialBatchTemplate = {
  visibleLine: 'Partial batch; source issue remains open for remaining work.',
  marker: '<!-- related-issues-validation: partial-batch -->',
}

export const VOUCHA_PR_BODY_POLICY: PrBodyValidationPolicy = {
  noSourceRules: [
    {
      matches: body => hasRelatedIssuesNoSourcePair(body, DIRECT_USER_REQUEST_NO_SOURCE_TEMPLATE),
      interactiveOnly: true,
      nonInteractiveError:
        'The direct-user-request no-source representation is allowed only in an interactive session.',
    },
    {
      matches: body => hasRelatedIssuesNoSourcePair(body, SCHEDULED_PROMPT_NO_SOURCE_TEMPLATE),
    },
  ],
  partialBatch: PARTIAL_BATCH_TEMPLATE,
  missingClosingReferenceMessage:
    'PR body must include at least one GitHub closing keyword (e.g. "Closes #123") in the "## Related issues" section, or the exact interactive direct-user-request no-source representation, scheduled no-source representation, or partial-batch representation after its single Refs entry.',
  provenanceRules: [
    {
      ...DEFAULT_PROVENANCE_RULES[0]!,
      message:
        'PR body must include a "Workspace setup:" line (e.g. "Workspace setup: ./dev/initialize monorepo").',
    },
    ...DEFAULT_PROVENANCE_RULES.slice(1),
  ],
}
