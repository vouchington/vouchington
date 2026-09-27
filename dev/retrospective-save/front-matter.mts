import { parse as load } from 'yaml'
import type { FeedbackReference } from 'vouchington-tooling/agent-blackboard'

import { isValidSessionId } from '../agent-session-id/valid-id.mts'

const FRONT_MATTER_DELIMITER = '---'

export type FrontMatterFields = {
  date: string
  issues: FeedbackReference[]
  prs: FeedbackReference[]
  sessionId?: string
  feedbackMetadata?: { workOutcome: unknown; feedbackCoverage: unknown }
}

// description is intentionally not extracted here: per the step-0 UAT baseline's
// provenance-field-set contract, it is not a first-class entry field — it stays
// readable only inside the stored markdown's own front matter.
export function parseFrontMatter(markdown: string): FrontMatterFields {
  const lines = markdown.split('\n')
  if (lines[0] !== FRONT_MATTER_DELIMITER) {
    throw new Error('retrospective doc is missing a front-matter block (must start with "---")')
  }
  const endIndex = lines.indexOf(FRONT_MATTER_DELIMITER, 1)
  if (endIndex === -1) {
    throw new Error('retrospective doc front-matter block is not closed with a second "---"')
  }

  let parsed: unknown
  try {
    parsed = load(lines.slice(1, endIndex).join('\n'))
  } catch (error) {
    throw new Error(`retrospective doc front matter is not valid YAML: ${String(error)}`, {
      cause: error,
    })
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('retrospective doc front matter must be a YAML mapping')
  }

  const {
    date,
    issues,
    prs,
    session_id: sessionId,
    work_outcome: workOutcome,
    feedback_coverage: feedbackCoverage,
  } = parsed as Record<string, unknown>
  if ((workOutcome !== undefined) !== (feedbackCoverage !== undefined))
    throw new Error(
      'retrospective front matter must provide both work_outcome and feedback_coverage',
    )
  if (typeof date !== 'string' || date.trim() === '') {
    throw new Error('retrospective doc front matter is missing a non-empty "date" field')
  }
  if (!Array.isArray(issues)) {
    throw new Error('retrospective doc front matter "issues" field must be an array')
  }
  if (!Array.isArray(prs)) {
    throw new Error('retrospective doc front matter "prs" field must be an array')
  }
  if (sessionId !== undefined && (typeof sessionId !== 'string' || sessionId.trim() === '')) {
    throw new Error('retrospective doc front matter "session_id" field must be a non-empty string')
  }
  if (sessionId !== undefined && !isValidSessionId(sessionId.trim())) {
    throw new Error('retrospective doc front matter "session_id" field must be a valid session id')
  }
  const references = (values: unknown[], field: string): FeedbackReference[] =>
    values.map(value => {
      if (
        (typeof value === 'string' && value.trim() !== '') ||
        (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
      )
        return value
      throw new Error(
        `retrospective doc front matter ${field} references must be positive integers or non-empty strings`,
      )
    })
  return {
    date,
    issues: references(issues, 'issues'),
    prs: references(prs, 'prs'),
    sessionId: sessionId?.trim(),
    ...(workOutcome === undefined ? {} : { feedbackMetadata: { workOutcome, feedbackCoverage } }),
  }
}
