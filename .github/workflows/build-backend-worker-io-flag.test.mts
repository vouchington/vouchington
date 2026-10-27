import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
type Step = {
  env?: Record<string, string>
  if?: string
  name?: string
  run?: string
}

type CompositeAction = { runs?: { steps?: Step[] } }

function readBuildBackendImagesAction(): CompositeAction {
  return load(
    readFileSync('.github/actions/build-backend-images/action.yml', 'utf8'),
  ) as CompositeAction
}

function step(action: CompositeAction, name: string): Step {
  const result = action.runs?.steps?.find(candidate => candidate.name === name)
  expect(result).toBeDefined()
  return result ?? {}
}

describe('worker-io backend automation flag', () => {
  it('derives active images from the checked-in boolean flag', () => {
    const action = readBuildBackendImagesAction()
    const imageSet = step(action, 'Set backend image set')
    const flagText = readFileSync('.github/worker-io-automation.env', 'utf8')
    const flagMatch = /^WORKER_IO_AUTOMATION_ENABLED=(true|false)\n$/.exec(flagText)

    expect(flagMatch).not.toBeNull()

    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'worker-io-automation-'))
    const outputPath = join(temporaryDirectory, 'github-output')
    try {
      const result = spawnSync('bash', ['-c', imageSet.run ?? ''], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: outputPath },
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      const outputs = Object.fromEntries(
        readFileSync(outputPath, 'utf8')
          .trim()
          .split('\n')
          .map(line => line.split('=')),
      )
      const workerIoEnabled = flagMatch?.[1] === 'true'
      expect(outputs).toMatchObject({
        active_worker_images: workerIoEnabled ? 'worker-cpu worker-io' : 'worker-cpu',
        worker_io_automation_enabled: workerIoEnabled ? 'true' : 'false',
      })
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true })
    }
  })
})
