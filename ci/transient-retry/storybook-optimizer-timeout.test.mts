import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import { makeCtx } from '../test-helpers/transient-retry/helpers.mts'
import { decide } from './decide.mts'
import { RULES } from './rules.mts'
import { storybookBrowserTestStepName } from './storybook-rules.mts'

interface Step {
  name?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, string>
  'timeout-minutes'?: number
}

const workflow = parseYaml(readFileSync('.github/workflows/storybook.yml', 'utf8')) as {
  jobs: { storybook: { steps: Step[] } }
}
const steps = workflow.jobs.storybook.steps
const browserSteps = steps.filter(step => step.name === storybookBrowserTestStepName)
const browserStep = browserSteps[0]
const browserStart = `VITEST_STORYBOOK_BROWSER: ${browserStep?.env?.VITEST_STORYBOOK_BROWSER}`
const optimizerStart = '[vite] (client) [optimizer] scanning dependencies...'
const ownTimeout = `The action '${browserStep?.name}' has timed out after ${browserStep?.['timeout-minutes']} minutes.`
const jobName = 'storybook / storybook'

const classify = (log: string) =>
  decide(
    makeCtx({
      failedJobNames: [jobName, 'web'],
      failedJobLogs: async () => new Map([[jobName, log]]),
    }),
    RULES,
  )

describe('Storybook optimizer timeout live topology', () => {
  it('anchors the classifier to the current browser step, not upload output', () => {
    expect(browserSteps).toHaveLength(1)
    expect(browserStep?.env?.VITEST_STORYBOOK_BROWSER).toBe('1')
    expect(browserStep?.run).toContain('pnpm exec ./ci/run-storybook-browser-tests.mts')
    expect(browserStep?.['timeout-minutes']).toBeGreaterThan(0)
    const browserIndex = steps.findIndex(step => step.name === storybookBrowserTestStepName)
    const browserUploads = steps
      .slice(browserIndex + 1)
      .filter(step => step.uses === './.github/actions/upload-full-lcov')
    expect(browserUploads).toHaveLength(2)
    for (const upload of browserUploads) {
      expect(upload.if).toContain('inputs.publish_coverage')
      expect(upload.if).not.toMatch(/always\(|failure\(|cancelled\(/)
    }
    const action = parseYaml(
      readFileSync('.github/actions/upload-full-lcov/action.yml', 'utf8'),
    ) as {
      runs: { steps: Step[] }
    }
    const upload = action.runs.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload?.with?.path).toBe('coverage-full/lcov.info')
  })

  it('matches current browser timeout without missing-artifact text after snapshot output', async () => {
    await expect(
      classify(['Test Files 10 passed', browserStart, optimizerStart, ownTimeout].join('\n')),
    ).resolves.toEqual({
      decision: 'rerun',
      matchedRule: 'storybook-browser-startup-transient',
    })
  })

  it.each(['coverage/lcov.info', 'coverage-full/lcov.info'])(
    'does not classify missing %s as an optimizer timeout',
    async path => {
      await expect(
        classify(
          [
            browserStart,
            optimizerStart,
            `No files were found with the provided path: ${path}`,
          ].join('\n'),
        ),
      ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
    },
  )

  it.each([
    '|web-storybook-browser| test output',
    'AssertionError: expected true to be false',
    'Error: expect(locator).toBeVisible() failed',
    'Unhandled Error: invalid test setup',
    'TypeError: Cannot read properties of undefined',
    'Failed to import test file /web/broken.test.ts',
    '##[error]Process completed with exit code 1.',
    'kernel: Out of memory: Killed process 123 (node)',
  ])('rejects terminal real failure evidence: %s', async failure => {
    await expect(
      classify([browserStart, optimizerStart, failure, ownTimeout].join('\n')),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('rejects another step timeout after an optimizer start', async () => {
    await expect(
      classify(
        [
          browserStart,
          optimizerStart,
          "The action 'Upload browser diagnostics' has timed out after 1 minutes.",
        ].join('\n'),
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('rejects an optimizer scan from an earlier internal attempt', async () => {
    await expect(
      classify(
        [
          browserStart,
          '[storybook-browser] starting attempt 1/3',
          optimizerStart,
          '[storybook-browser] starting attempt 2/3',
          ownTimeout,
        ].join('\n'),
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })
})
