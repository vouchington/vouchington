import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../../static-code-analysis/repo-file-policy/repo-file-policy-test-helpers.mts'
import {
  checkTransientRetryPromptGuard,
  TRANSIENT_RETRY_PROMPT_PATH,
  TRANSIENT_RETRY_RULES_PATH,
  validateTransientRetryPrompt,
} from '../../static-code-analysis/repo-file-policy/transient-retry-prompt-guard.mts'

const promptText = readFileSync(TRANSIENT_RETRY_PROMPT_PATH, 'utf8')

const PROTECTED_CONTRACT_FRAGMENTS = [
  'Review `ci/transient-retry/rules.mts`. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.',
  'For a bounded repository-owned root cause',
  'For repeated same-cause fingerprint vocabulary',
  'For a rule that demonstrably no longer matches',
  'For a current, genuinely external transient',
  'If the audit confirms a repository-owned root cause but its smallest safe fix',
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

describe('transient-retry scheduled prompt guard', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('accepts the real prompt and an unrelated guidance addition', () => {
    expect(validateTransientRetryPrompt(promptText)).toEqual([])
    expect(
      validateTransientRetryPrompt(
        `${promptText}\n- Inspect candidate evidence chronologically.\n`,
      ),
    ).toEqual([])

    const errors: string[] = []
    checkTransientRetryPromptGuard(process.cwd(), [TRANSIENT_RETRY_PROMPT_PATH], errors)
    expect(errors).toEqual([])
  })

  it('rejects removal of every protected accepted-contract fragment', () => {
    for (const fragment of PROTECTED_CONTRACT_FRAGMENTS) {
      expect(promptText).toContain(fragment)
      expect(validateTransientRetryPrompt(promptText.replaceAll(fragment, ''))).not.toEqual([])
    }
  })

  it('rejects fallback text moved outside the fallback section', () => {
    const marker = '<!-- transient-retry-root-cause: <consumerKey> | <rootCauseKey> -->'
    const withoutMarker = promptText.replace(marker, '')
    const firstNewline = withoutMarker.indexOf('\n') + 1
    const movedMarker = `${withoutMarker.slice(0, firstNewline)}${marker}\n${withoutMarker.slice(firstNewline)}`

    expect(validateTransientRetryPrompt(movedMarker)).toContain(
      `missing required fallback contract text: ${marker}`,
    )
  })

  it('rejects issue-mode completion artifacts', () => {
    for (const forbidden of ['harness-scheduled-completion:', 'codex-issue.txt']) {
      expect(validateTransientRetryPrompt(`${promptText}\n${forbidden}\n`)).toContain(
        `forbidden scheduled-prompt text: ${forbidden}`,
      )
    }
  })

  it('rejects direct GitHub queries and issue-agent mutation routing', () => {
    for (const [text, fragment] of [
      ['$github-issue', '$github-issue'],
      ['gh pr list', 'gh pr '],
      ['gh issue list', 'gh issue '],
    ] as const) {
      expect(validateTransientRetryPrompt(`${promptText}\n${text}\n`)).toContain(
        `forbidden scheduled-prompt text: ${fragment}`,
      )
    }
  })

  it('runs through the aggregate boundary for a valid and missing prompt', async () => {
    const unrelatedRepoErrors: string[] = []
    checkTransientRetryPromptGuard(process.cwd(), [], unrelatedRepoErrors)
    expect(unrelatedRepoErrors).toEqual([])

    const validRepo = await makeRepo()
    await track(validRepo, TRANSIENT_RETRY_RULES_PATH, 'export const rules = []\n')
    await track(validRepo, TRANSIENT_RETRY_PROMPT_PATH, promptText)
    await expect(run(validRepo)).resolves.toMatchObject({ stdout: 'All checks passed.' })

    const missingPromptRepo = await makeRepo()
    await track(missingPromptRepo, TRANSIENT_RETRY_RULES_PATH, 'export const rules = []\n')
    await expect(run(missingPromptRepo)).rejects.toMatchObject({
      stdout: expect.stringContaining('expected tracked scheduled prompt is missing'),
    })
  })
})
