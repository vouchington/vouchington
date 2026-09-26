import { describe, expect, it } from 'vitest'
import {
  fixMainPrompt,
  parsedDispatch,
  parsedMain,
} from '../test-helpers/fix-main.test-helpers.mts'

describe('fix-main workflow', () => {
  it('renders failure and related-work evidence into the disabled prompt', () => {
    const renderJob = parsedMain.jobs?.['render-prompt']
    const setupStep = renderJob?.steps?.find(s => s.uses?.endsWith('/setup-node-pnpm'))
    const renderStep = renderJob?.steps?.find(s => s.id === 'render')

    expect(setupStep).toBeDefined()
    expect(renderStep?.uses).toContain('jonathanong/auto-harness/actions/harness-render-prompt@')
    expect(renderStep?.with?.['template']).toBe('docs/prompts/automation/fix-main.md')
    expect(fixMainPrompt).toContain('{{RUN_URL}}')
    expect(fixMainPrompt).toContain('{{RUN_ID}}')
    expect(fixMainPrompt).toContain('{{COMMIT_SHA}}')
    expect(fixMainPrompt).toContain('{{RELATED_CANDIDATES}}')
  })

  it('keeps candidate handling bounded and deduplicated', () => {
    expect(fixMainPrompt).toContain('Closes #N')
  })

  it('passes source context for Slack automation threads', () => {
    const dispatchJob = parsedMain.jobs?.['dispatch']
    const slackSource = dispatchJob?.with?.['slack-source'] as string

    expect(slackSource).toContain('failed on `main`')
    expect(slackSource).toContain('Failing run')
    expect(slackSource).toContain('Failing commit')
  })

  it('requires evidence for transient classification', () => {
    expect(fixMainPrompt).toContain('`ci/transient-retry/rules.mts`')
  })

  it('publishes only after exact live revalidation', () => {
    expect(fixMainPrompt).toContain('## Root cause')
    expect(fixMainPrompt).toContain('## Implementation choice')
    expect(fixMainPrompt).toContain('## Options considered')
  })

  it('stops and reports options when materially different approaches remain', () => {
    expect(fixMainPrompt).toContain('`## Problem`')
    expect(fixMainPrompt).toContain('`## Options`')
    expect(fixMainPrompt).toContain('`## Recommendation`')
  })

  it('passes automation:auto-fix label from fix-main dispatch', () => {
    const dispatchJob = parsedMain.jobs?.['dispatch']
    expect(dispatchJob?.with?.['pr-label']).toBe('automation:auto-fix')
    expect(fixMainPrompt).toContain('`automation`')
    expect(fixMainPrompt).toContain('`automation:auto-fix`')
  })

  it('keeps the dispatch workflow to a single job', () => {
    expect(Object.keys(parsedDispatch.jobs ?? {})).toEqual(['dispatch'])
  })
})
