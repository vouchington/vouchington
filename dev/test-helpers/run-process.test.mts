import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runProcess } from './run-process.mts'

describe('runProcess', () => {
  it('resolves a successful command with captured stdout and stderr', async () => {
    const result = await runProcess(process.execPath, [
      '-e',
      'process.stdout.write("out"); process.stderr.write("err")',
    ])

    expect(result).toMatchObject({
      code: 0,
      signal: null,
      timedOut: false,
      errno: undefined,
      stdout: 'out',
      stderr: 'err',
    })
  })

  it('reports a non-zero exit code instead of coercing it to 1', async () => {
    const result = await runProcess(process.execPath, ['-e', 'process.exit(7)'])

    expect(result).toMatchObject({ code: 7, signal: null, timedOut: false, errno: undefined })
  })

  it('reports the signal that killed the child without marking it as timed out', async () => {
    // The child sends itself SIGTERM (delivered before `kill` returns for a
    // single-threaded process sending its own pid), so this cannot race the
    // rest of the script. No `timeoutMs` is set, so a real signal death must
    // stay distinct from a runProcess-driven timeout kill.
    const result = await runProcess('sh', ['-c', 'kill -TERM $$; sleep 5'])

    expect(result).toMatchObject({ code: null, signal: 'SIGTERM', timedOut: false })
  })

  it('reports a timeout as timedOut with SIGTERM and a null code', async () => {
    const result = await runProcess('/bin/sleep', ['5'], { timeoutMs: 200 })

    expect(result).toMatchObject({
      code: null,
      signal: 'SIGTERM',
      timedOut: true,
      errno: undefined,
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(150)
    expect(result.durationMs).toBeLessThan(4000)
  })

  it.each([143, 0])(
    'reports a timeout even when a TERM trap makes the child exit %i',
    async exitCode => {
      // A trapped shutdown can make a killed child look like it exited normally by its
      // own code, including 0. timedOut must still be true, and the trap's exit code is
      // reported as-is rather than miscategorized as a normal exit.
      const result = await runProcess(
        '/bin/bash',
        ['-c', `trap 'kill $!; exit ${exitCode}' TERM; /bin/sleep 5 & wait`],
        { timeoutMs: 200 },
      )

      expect(result).toMatchObject({
        code: exitCode,
        signal: null,
        timedOut: true,
        errno: undefined,
      })
      expect(result.durationMs).toBeGreaterThanOrEqual(150)
      expect(result.durationMs).toBeLessThan(4000)
    },
  )

  it('returns at the timeout even when a grandchild keeps stdout open', async () => {
    // The backgrounded sleep inherits the stdout pipe and outlives the killed shell by
    // about three seconds; the timeout must not wait for it to close the pipe.
    const result = await runProcess('/bin/bash', ['-c', '/bin/sleep 3 & wait'], {
      timeoutMs: 200,
    })

    expect(result).toMatchObject({ code: null, signal: 'SIGTERM', timedOut: true })
    expect(result.durationMs).toBeLessThan(2000)
  })

  it('reports a spawn error via errno instead of coercing it to exit code 1', async () => {
    const missingBinary = join(tmpdir(), 'run-process-test-missing-binary')

    const result = await runProcess(missingBinary, [])

    expect(result).toMatchObject({ code: null, signal: null, timedOut: false, errno: 'ENOENT' })
  })
})
