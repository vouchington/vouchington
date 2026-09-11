import { parse as load } from 'yaml'

import { isValidSessionId } from '../agent-session-id/valid-id.mts'

const FRONT_MATTER_DELIMITER = '---'

export type FrontMatterFields = {
  date: string
  issues: unknown[]
  prs: unknown[]
  sessionId?: string
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

  const { date, issues, prs, session_id: sessionId } = parsed as Record<string, unknown>
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
  return { date, issues, prs, sessionId: sessionId?.trim() }
}
