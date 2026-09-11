import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { requireSuccess, terminateChild } from '../cloc/child-process.mts'

describe('cloc child process cleanup', () => {
  it('terminates and awaits a child after streamed parsing fails', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const completion = requireSuccess(child, 'fixture child')

    await terminateChild(child, completion)

    expect(child.killed).toBe(true)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })
})
