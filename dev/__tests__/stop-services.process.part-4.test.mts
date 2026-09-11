import { spawn } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import { createStopServicesFixtures } from '../test-helpers/stop-services-process.mts'

const { cleanup, makeFakeBin, makeRepo, runScript } = createStopServicesFixtures()

describe('dev/stop-services (process termination)', () => {
  afterEach(cleanup)

  it('does not terminate a port listener outside the current worktree', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const child = spawn(
      process.execPath,
      ['-e', 'process.on("SIGTERM", () => process.exit(42)); setInterval(() => {}, 1000)'],
      { stdio: 'ignore' },
    )
    let exited = false
    const childPid = String(child.pid)
    const exitPromise = new Promise(resolve => {
      child.once('exit', () => {
        exited = true
        resolve(undefined)
      })
    })
    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_LSOF_3900: childPid,
        [`FAKE_LSOF_CWD_${childPid}`]: '/tmp/other-worktree',
      },
    })
    expect(result.stdout).toContain(`Skipping PID ${childPid} on port 3900`)
    expect(exited).toBe(false)
    child.kill('SIGTERM')
    await exitPromise
  })
})
