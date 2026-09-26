import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function lines(path: string): string[] {
  return readFileSync(path, 'utf8').split(/\r?\n/u)
}

describe('Harness automation prompt contracts', () => {
  it('marks issue-only scheduled prompts with the exact lines scheduled-prompts.yml matches', () => {
    for (const path of [
      'docs/prompts/scheduled/ci-job-runtime.md',
      'docs/prompts/scheduled/first-party-dependencies.md',
      'docs/prompts/scheduled/github-issue-hygiene.md',
    ]) {
      expect(lines(path)).toContain('<!-- harness-scheduled-completion: issue -->')
    }
    expect(lines('docs/prompts/scheduled/github-issue-hygiene.md')).toContain(
      '<!-- harness-scheduled-scope: existing-issues -->',
    )
  })

  it('keeps untrusted PR state and job logs out of rendered automation prompts', () => {
    expect(readFileSync('.github/workflows/shepherd.yml', 'utf8')).not.toMatch(
      /PR_(?:STATE_)?SNAPSHOT=/u,
    )
    for (const file of ['fix-dependabot.yml', 'fix-main.yml']) {
      const workflow = readFileSync(`.github/workflows/${file}`, 'utf8')
      expect(workflow).not.toMatch(/FAILED_(?:JOB_)?(?:LOG|EVIDENCE)=/u)
      expect(workflow).not.toMatch(/actions\/jobs\/.+\/logs/u)
    }
  })

  it('gives the unclassified-transient interim classifier a publishable no-closing-ref body', () => {
    const text = readFileSync('docs/prompts/automation/fix-main.md', 'utf8').replace(/\s+/gu, ' ')

    expect(text).toContain(
      'No closing reference; root-cause issue tracked via the Refs entry above.',
    )
    expect(text).toContain(
      '<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->',
    )
  })
})
