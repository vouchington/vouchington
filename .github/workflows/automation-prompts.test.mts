import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

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

  it('renders Fix Main and merge-queue ejection around one shared CI-failure core', () => {
    const corePath = 'docs/prompts/automation/ci-failure-core.md'
    expect(readFileSync(corePath, 'utf8')).not.toMatch(/\{\{\w+\}\}/u)
    for (const name of ['fix-main', 'merge-queue-ejection']) {
      const workflow = parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8')) as {
        jobs: Record<string, { steps?: { id?: string; with?: Record<string, string> }[] }>
      }
      const render = workflow.jobs['render-prompt']?.steps?.find(step => step.id === 'render')?.with
      expect(render?.['var-files']?.trim()).toBe(`CI_FAILURE_CORE=${corePath}`)
      const wrapper = readFileSync(`docs/prompts/automation/${name}.md`, 'utf8')
      expect(wrapper.match(/\{\{CI_FAILURE_CORE\}\}/gu)).toHaveLength(1)
      const supplied = [render?.['vars'], render?.['var-files']]
        .flatMap(value => (value ?? '').split('\n'))
        .filter(Boolean)
        .map(line => line.split('=')[0]?.trim())
      const used = new Set([...wrapper.matchAll(/\{\{(\w+)\}\}/gu)].map(match => match[1]))
      expect([...used].toSorted()).toEqual(supplied.toSorted())
    }
  })
})
