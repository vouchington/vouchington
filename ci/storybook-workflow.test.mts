import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { parseStorybookBrowserRunnerArgs } from 'vouchington-tooling/storybook-browser-runner'

const workflow = parse(readFileSync('.github/workflows/storybook.yml', 'utf8')) as {
  jobs: {
    storybook: {
      'timeout-minutes': number
      steps: {
        name?: string
        run?: string
        'timeout-minutes': number
      }[]
    }
  }
}
const job = workflow.jobs.storybook
const step = job.steps.find(item => item.name === 'Run Storybook browser tests')
const commandPrefix = 'pnpm exec vouchington storybook-browser-runner '
const command = step?.run?.trim().split('\n').at(-1)
const project = () => {
  expect(command?.startsWith(commandPrefix)).toBe(true)
  return parseStorybookBrowserRunnerArgs(
    command!
      .slice(commandPrefix.length)
      .split(/\s+/)
      .map(arg => arg.replace(/^'|'$/g, '')),
  )
}

describe('storybook workflow', () => {
  it('binds the canonical runner to application reports, optimizer config and child command', () => {
    expect(project()).toEqual({
      projectName: 'web-storybook-browser',
      resultFiles: [
        '.vitest-reports/web-storybook-browser.json',
        'coverage/lcov.info',
        'storybook-browser-test-report.junit.xml',
      ],
      completionFile: '.vitest-reports/web-storybook-browser.json',
      optimizeDepsConfigPath: 'test-helpers/vitest-config/storybook-browser-optimize-deps.mts',
      progressPrefix: '[storybook-browser-progress]',
      args: [
        'exec',
        './ci/with-node-test-options',
        'vitest',
        'run',
        '--bail=3',
        '--project',
        'web-storybook-browser',
      ],
    })
  })

  it('allocates and exports a port immediately before the browser runner, preserving allocation failure', () => {
    expect(step?.run?.trim().split('\n').slice(0, -1)).toEqual([
      'VITEST_STORYBOOK_BROWSER_API_PORT=$(python3 node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py 1)',
      'export VITEST_STORYBOOK_BROWSER_API_PORT',
    ])
  })

  it('keeps job cancellation inside the aggregate step deadline', () => {
    expect(job['timeout-minutes']).toBeLessThan(
      job.steps.reduce((sum, item) => sum + item['timeout-minutes'], 0),
    )
  })
})
