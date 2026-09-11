import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const detectChangesJobName = 'detect-changes'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [detectChangesJobName],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

const failedJobAnnotations = (messages: string[]) => () => Promise.resolve(messages)

const github5xxAnnotation = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<title>Unicorn! &middot; GitHub</title>',
  '</head>',
  '<body>',
  '<h1>500</h1>',
  "<p>Sorry, something's gone wrong. Try again, or contact us if the problem persists.</p>",
  '</body>',
  '</html>',
].join('\n')

describe('detect-changes-paths-filter-github-5xx', () => {
  it('matches the detect-changes GitHub 5xx annotation on attempt 1', async () => {
    const result = await decide(
      makeCtx({
        failedJobAnnotations: failedJobAnnotations([github5xxAnnotation]),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('detect-changes-paths-filter-github-5xx')
  })

  it('matches the reusable-workflow detect-changes job name', async () => {
    const jobName = 'detect-changes / detect-changes'
    const result = await decide(
      makeCtx({
        failedJobNames: [jobName],
        failedJobAnnotations: failedJobAnnotations([github5xxAnnotation]),
      }),
      RULES,
    )
    expect(result.matchedRule).toBe('detect-changes-paths-filter-github-5xx')
  })

  it('does not match a non-5xx API failure annotation', async () => {
    const result = await decide(
      makeCtx({
        failedJobAnnotations: failedJobAnnotations(['Process completed with exit code 1.']),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match an unrelated detect-changes config failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobAnnotations: failedJobAnnotations([
          'Error: Invalid filter configuration: unknown filter type',
        ]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another genuinely-failed job is mixed in', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [detectChangesJobName, 'test-web'],
        jobConclusions: new Map([
          [detectChangesJobName, 'failure'],
          ['test-web', 'failure'],
        ]),
        failedJobAnnotations: failedJobAnnotations([github5xxAnnotation]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a non-GitHub 5xx HTML error page', async () => {
    const nonGithub5xxAnnotation = [
      '<!DOCTYPE html>',
      '<html>',
      '<head><title>502 Bad Gateway</title></head>',
      '<body><center><h1>502 Bad Gateway</h1></center></body>',
      '</html>',
    ].join('\n')

    const result = await decide(
      makeCtx({
        failedJobAnnotations: failedJobAnnotations([nonGithub5xxAnnotation]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when detect-changes was cancelled rather than failed', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [detectChangesJobName],
        jobConclusions: new Map([[detectChangesJobName, 'cancelled']]),
        failedJobAnnotations: failedJobAnnotations([github5xxAnnotation]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the wrong workflow name', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (backend)',
        failedJobAnnotations: failedJobAnnotations([github5xxAnnotation]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when a 5xx annotation is mixed with a non-5xx annotation', async () => {
    const result = await decide(
      makeCtx({
        failedJobAnnotations: failedJobAnnotations([
          github5xxAnnotation,
          'Process completed with exit code 1.',
        ]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when detect-changes has zero annotations', async () => {
    const result = await decide(
      makeCtx({
        failedJobAnnotations: failedJobAnnotations([]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 2,
        failedJobAnnotations: failedJobAnnotations([github5xxAnnotation]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
