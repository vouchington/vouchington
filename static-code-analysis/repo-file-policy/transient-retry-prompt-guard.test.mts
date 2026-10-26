import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checkTransientRetryPromptGuard,
  TRANSIENT_RETRY_PROMPT_PATH,
  TRANSIENT_RETRY_RULES_PATH,
  validateTransientRetryPrompt,
} from './transient-retry-prompt-guard.mts'

describe('transient retry prompt guard', () => {
  const roots: string[] = []

  const promptFixture = [
    'Review `ci/transient-retry/rules.mts`. Pick at most one concrete, bounded improvement that is safe to ship in one PR.',
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
  ].join('\n')

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  function writeFixture(root: string, path: string, content: string) {
    const absolute = join(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, content)
  }

  it('accepts a finite scheduled-prompt fixture and rejects lost or forbidden contract text', () => {
    expect(validateTransientRetryPrompt(promptFixture)).toEqual([])

    const changed = promptFixture.replace(
      'For a bounded repository-owned root cause',
      'For a repository-owned cause',
    )
    expect(validateTransientRetryPrompt(changed)).toContain(
      'missing required contract text: For a bounded repository-owned root cause',
    )
    expect(validateTransientRetryPrompt(`${promptFixture}\nRun gh issue close 123`)).toContain(
      'forbidden scheduled-prompt text: gh issue ',
    )

    const root = mkdtempSync(join(tmpdir(), 'transient-retry-prompt-'))
    roots.push(root)
    writeFixture(root, TRANSIENT_RETRY_PROMPT_PATH, promptFixture)
    const errors: string[] = []
    checkTransientRetryPromptGuard(
      root,
      [TRANSIENT_RETRY_RULES_PATH, TRANSIENT_RETRY_PROMPT_PATH],
      errors,
    )
    expect(errors).toEqual([])
  })

  it('reports a missing tracked scheduled prompt when the rules file remains tracked', () => {
    const root = mkdtempSync(join(tmpdir(), 'transient-retry-prompt-'))
    roots.push(root)
    const errors: string[] = []
    checkTransientRetryPromptGuard(root, [TRANSIENT_RETRY_RULES_PATH], errors)
    expect(errors).toEqual([
      `::error file=${TRANSIENT_RETRY_PROMPT_PATH}::${TRANSIENT_RETRY_PROMPT_PATH}: expected tracked scheduled prompt is missing`,
    ])
  })
})
