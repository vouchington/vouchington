import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parseGithubOutput } from '../../test-helpers/github-output.mts'
import { runVitestCiSelect } from './ci-select.mts'

describe('merge-group Vitest selection', () => {
  it('runs the full suite without invoking the PR planner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ci-select-merge-group-'))
    const outputPath = join(directory, 'output')
    const summaryPath = join(directory, 'summary')
    const savedEnv = {
      EVENT_NAME: process.env['EVENT_NAME'],
      GITHUB_OUTPUT: process.env['GITHUB_OUTPUT'],
      GITHUB_STEP_SUMMARY: process.env['GITHUB_STEP_SUMMARY'],
    }
    Object.assign(process.env, {
      EVENT_NAME: 'merge_group',
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
    })
    let plannerCalled = false
    try {
      await runVitestCiSelect(async () => {
        plannerCalled = true
        throw new Error('merge-group selection must not invoke the PR planner')
      }, directory)

      const output = parseGithubOutput(await readFile(outputPath, 'utf8'))
      expect(plannerCalled).toBe(false)
      expect(output).toMatchObject({
        'full-suite': 'true',
        reason: 'non-PR event (merge_group)',
        'full-storybook': 'true',
      })
      expect(await readFile(join(directory, 'vitest-test-plan.json'), 'utf8')).toContain(
        '"plannerExecuted": false',
      )
      expect(await readFile(join(directory, 'vitest-test-plan.md'), 'utf8')).toContain(
        'event is `merge_group`',
      )
    } finally {
      for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      await rm(directory, { force: true, recursive: true })
    }
  })
})
