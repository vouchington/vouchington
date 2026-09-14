import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { SELECTED_FILES_ENV_MAX_BYTES } from 'vouchington-tooling/gha-selected-files'

import { parseGithubOutput } from '../../test-helpers/github-output.mts'
import type { PlannedTests } from '../test-plan.mts'
import { resolveJobSelection, runVitestCiSelect } from './ci-select.mts'

type JobSuiteCounter = (worktreeRoot: string) => Map<string, number>

function emptyPlan(): PlannedTests {
  return {
    changedFiles: [],
    comment: '',
    fallbackReason: null,
    fallbackTriggered: false,
    files: [],
    groups: [],
    json: {} as PlannedTests['json'],
    targets: [],
    threshold: 0,
    total: 0,
    warnings: [],
  }
}

async function runSelection(countJobSuites: JobSuiteCounter, plan = emptyPlan()) {
  const dir = await mkdtemp(join(tmpdir(), 'vitest-ci-select-sharding-'))
  const outputPath = join(dir, 'output')
  const savedEnv = {
    EVENT_NAME: process.env['EVENT_NAME'],
    GITHUB_BASE_REF: process.env['GITHUB_BASE_REF'],
    GITHUB_OUTPUT: process.env['GITHUB_OUTPUT'],
  }
  Object.assign(process.env, {
    EVENT_NAME: 'pull_request',
    GITHUB_BASE_REF: 'main',
    GITHUB_OUTPUT: outputPath,
  })
  try {
    await runVitestCiSelect(async () => plan, dir, countJobSuites)
    return parseGithubOutput(await readFile(outputPath, 'utf8'))
  } finally {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(dir, { force: true, recursive: true })
  }
}

describe('Vitest CI selection', () => {
  it('promotes an env-oversized selection to full so GitHub can spawn the step shell', () => {
    const files: string[] = []
    while (Buffer.byteLength(files.join('\n'), 'utf8') <= SELECTED_FILES_ENV_MAX_BYTES) {
      files.push(
        `backend/workers/maintenance-scheduler-recovery-${files.length}.real-glide.mock.test.mts`,
      )
    }
    expect(resolveJobSelection('test-backend-unit', files, false)).toEqual({
      fullJob: true,
      selectedFiles: [],
      reason: 'env-budget',
    })
  })

  it('does not force tooling full when suite counting fails', async () => {
    const output = await runSelection(() => {
      throw new Error('suite counter unavailable')
    })

    expect(output).toMatchObject({
      'full-suite': 'false',
      'full-test-tooling': 'false',
      'run-tests-test-tooling': 'false',
    })
  })

  it('leaves promoted full-suite sizing to the reusable workflow', async () => {
    const files = ['integration-tests/web-api/a.test.mts', 'integration-tests/web-api/b.test.mts']
    const output = await runSelection(() => new Map([['test-web-api', 3]]), {
      ...emptyPlan(),
      files,
      groups: [{ remaining: 0, selected: files, type: 'direct' }],
      targets: [
        {
          baseCommand: [],
          config: null,
          project: 'web-api',
          runner: 'vitest',
          runnerArgs: [],
          testFiles: files,
        },
      ],
      total: files.length,
    })

    expect(output['full-test-web-api']).toBe('true')
    expect(output).not.toHaveProperty('shard-total-test-web-api')
  })
})
