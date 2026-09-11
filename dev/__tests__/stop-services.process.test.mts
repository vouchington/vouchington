import { spawn } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import { createStopServicesFixtures } from '../test-helpers/stop-services-process.mts'

const { cleanup, makeFakeBin, makeRepo, runScript } = createStopServicesFixtures()

describe('dev/stop-services (process termination)', () => {
  afterEach(cleanup)

  it('terminates a worker-only backend process in the current worktree', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const child = spawn(
      process.execPath,
      ['-e', 'process.on("SIGTERM", () => process.exit(0)); setInterval(() => {}, 1000)'],
      { stdio: 'ignore' },
    )
    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      resolve => child.once('exit', (code, signal) => resolve({ code, signal })),
    )
    await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_LSOF_CWD: cwd,
        FAKE_PS_OUTPUT: `${child.pid} node --watch backend/entrypoints/worker-io/serve.mts\\n`,
      },
    })
    const exit = await exitPromise
    expect([0, null]).toContain(exit.code)
    expect([null, 'SIGTERM']).toContain(exit.signal)
  })
})
