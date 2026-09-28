import { hasClosingIssueReference, type ReferencedIssue } from './closing-refs.mts'
import { validatePrDescriptionContent } from './content-policy.mts'
import { findEscapeCommentClosingKeywordLeaks } from './escape-comment-leaks.mts'
import { isDirectUserRequestNoSourceBody } from './direct-user-request.mts'
import {
  isFixMainInterimClassifierNoClosingRefBody,
  isScheduledPromptNoSourceBody,
} from './scheduled-no-source.mts'
import { githubBodyLengthError } from '../github-body-length.mts'

export type PrBodyValidationResult = {
  advisories: string[]
  errors: string[]
  referencedIssues: ReferencedIssue[]
  ok: boolean
}

export type PrBodyValidationOptions = {
  /** Trusted runtime context, never read from the PR body. Omitted context fails closed. */
  automationContext?: boolean
}

const WORKSPACE_SETUP_RE = /^\s*Workspace\s+setup\s*:/im
const PROVENANCE_RULES = [
  { label: 'Agent:', re: /^\s*Agent\s*:\s*\S/im },
  { label: 'Device:', re: /^\s*Device\s*:\s*\S/im },
  { label: 'Worktree:', re: /^\s*Worktree\s*:\s*\S/im },
] as const

export function validatePrBody(
  body: string,
  options: PrBodyValidationOptions = {},
): PrBodyValidationResult {
  const bodyLengthError = githubBodyLengthError(body)
  if (bodyLengthError)
    return { advisories: [], errors: [bodyLengthError], ok: false, referencedIssues: [] }

  const directUserRequest = isDirectUserRequestNoSourceBody(body)
  const interactive = options.automationContext === false
  const { errors, relatedIssuesSection } = validatePrDescriptionContent(body)
  if (directUserRequest && !interactive) {
    errors.push(
      'The direct-user-request no-source representation is allowed only in an interactive session.',
    )
  }

  if (
    relatedIssuesSection !== undefined &&
    !hasClosingIssueReference(relatedIssuesSection) &&
    !(directUserRequest && interactive) &&
    !isScheduledPromptNoSourceBody(body) &&
    !isFixMainInterimClassifierNoClosingRefBody(body)
  ) {
    errors.push(
      'PR body must include at least one GitHub closing keyword (e.g. "Closes #123") in the "## Related issues" section, or the exact interactive direct-user-request no-source representation, or the exact scheduled-prompt no-source representation, or the exact Fix Main interim-classifier no-closing-ref representation alongside a Refs entry. See .agents/skills/agent-workflow/git-and-prs.md.',
    )
  }

  if (!WORKSPACE_SETUP_RE.test(body)) {
    errors.push(
      'PR body must include a "Workspace setup:" line (e.g. "Workspace setup: ./dev/initialize monorepo"). See .agents/skills/agent-workflow/start-of-work.md.',
    )
  }

  for (const rule of PROVENANCE_RULES) {
    if (!rule.re.test(body)) {
      errors.push(`PR body must include "${rule.label}" line.`)
    }
  }

  errors.push(...findEscapeCommentClosingKeywordLeaks(body))

  return { advisories: [], errors, ok: errors.length === 0, referencedIssues: [] }
}
