import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const TRANSIENT_RETRY_PROMPT_PATH = 'docs/prompts/scheduled/transient-retry.md'
export const TRANSIENT_RETRY_RULES_PATH = 'ci/transient-retry/rules.mts'

const OPENING_LINE =
  'Review `ci/transient-retry/rules.mts`. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.'
const FALLBACK_START =
  'If the audit confirms a repository-owned root cause but its smallest safe fix'

const REQUIRED_FULL_TEXT = [
  'For a bounded repository-owned root cause',
  'For repeated same-cause fingerprint vocabulary',
  'For a rule that demonstrably no longer matches',
  'For a current, genuinely external transient',
] as const

const REQUIRED_FALLBACK_TEXT = [
  '<!-- transient-retry-root-cause: <consumerKey> | <rootCauseKey> -->',
  'exact keys, rule id, and root-cause wording',
  'bounded live GitHub results',
  'Record the query and do not claim coverage beyond its bound',
  'only when that recommendation accompanies a real, independently mergeable patch',
  'An open matching PR disqualifies that candidate',
  'Treat an open matching issue as covered',
  'Never recommend reopening a closed issue',
  'materially distinct active or removal scope',
  'A merged matching PR is evidence',
  'A closed, unmerged PR is not active tracking',
  'Never recreate the closed PR',
  'unchanged active scope',
  'Only an untracked candidate, including one evidenced solely by a closed PR, or materially distinct scope can justify a tracking-issue recommendation',
  'If every viable candidate is already covered by an existing issue or PR, is a current external transient, or otherwise lacks an independently mergeable patch',
  'stop and report that outcome',
  'Do not instantiate or include a root-cause marker',
  'Before including a root-cause-specific recommendation, recheck for matching open PRs',
  'confirmed repository-owned root cause',
  'smallest long-term fix',
  'retirement criteria',
  'Do not mutate GitHub directly',
  'No source issue; scheduled prompt run.\n<!-- related-issues-validation: no-source-scheduled-prompt -->',
  'non-closing `Refs #N`',
  'why it remains open',
  'proposed PR body',
] as const

const FORBIDDEN_TEXT = [
  'harness-scheduled-completion:',
  'codex-scheduled-completion:',
  'codex-issue.txt',
  'codex-completion.json',
  'codex-scheduled-github-context.json',
  '$github-issue',
  'gh pr ',
  'gh issue ',
] as const

function containsText(content: string, fragment: string): boolean {
  return content.includes(fragment)
}

export function validateTransientRetryPrompt(content: string): string[] {
  const errors: string[] = []
  const openingLine = content.split(/\r?\n/, 1)[0]
  if (openingLine !== OPENING_LINE) {
    errors.push('must retain the exact bounded PR-mode opening line')
  }

  for (const fragment of REQUIRED_FULL_TEXT) {
    if (!containsText(content, fragment)) {
      errors.push(`missing required contract text: ${fragment}`)
    }
  }

  const fallbackIndex = content.indexOf(FALLBACK_START)
  if (fallbackIndex === -1) {
    errors.push('missing the repository-owned root-cause fallback section')
  } else {
    const fallbackText = content.slice(fallbackIndex)
    for (const fragment of REQUIRED_FALLBACK_TEXT) {
      if (!containsText(fallbackText, fragment)) {
        errors.push(`missing required fallback contract text: ${fragment}`)
      }
    }
  }

  for (const fragment of FORBIDDEN_TEXT) {
    if (containsText(content, fragment)) {
      errors.push(`forbidden scheduled-prompt text: ${fragment}`)
    }
  }

  return errors
}

export function checkTransientRetryPromptGuard(
  repoRoot: string,
  trackedFiles: string[],
  errors: string[],
): void {
  if (
    !trackedFiles.includes(TRANSIENT_RETRY_RULES_PATH) &&
    !trackedFiles.includes(TRANSIENT_RETRY_PROMPT_PATH)
  ) {
    return
  }

  if (!trackedFiles.includes(TRANSIENT_RETRY_PROMPT_PATH)) {
    errors.push(
      `::error file=${TRANSIENT_RETRY_PROMPT_PATH}::${TRANSIENT_RETRY_PROMPT_PATH}: expected tracked scheduled prompt is missing`,
    )
    return
  }

  const content = readFileSync(join(repoRoot, TRANSIENT_RETRY_PROMPT_PATH), 'utf8')
  for (const diagnostic of validateTransientRetryPrompt(content)) {
    errors.push(
      `::error file=${TRANSIENT_RETRY_PROMPT_PATH}::${TRANSIENT_RETRY_PROMPT_PATH}: ${diagnostic}`,
    )
  }
}
