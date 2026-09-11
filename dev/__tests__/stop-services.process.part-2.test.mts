import { spawn } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import { createStopServicesFixtures } from '../test-helpers/stop-services-process.mts'

const { cleanup, makeFakeBin, makeRepo, runScript } = createStopServicesFixtures()

describe('dev/stop-services (process termination)', () => {
  afterEach(cleanup)

  it('does not terminate non-node commands that mention the worker entrypoint', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const child = spawn(
      process.execPath,
      ['-e', 'process.on("SIGTERM", () => process.exit(42)); setInterval(() => {}, 1000)'],
      { stdio: 'ignore' },
    )
    let exited = false
    const exitPromise = new Promise(resolve => {
      child.once('exit', () => {
        exited = true
        resolve(undefined)
      })
    })
    await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_LSOF_CWD: cwd,
        FAKE_PS_OUTPUT: `${child.pid} vim backend/entrypoints/worker-io/serve.mts\\n`,
      },
    })
    expect(exited).toBe(false)
    child.kill('SIGTERM')
    await exitPromise
  })
})
