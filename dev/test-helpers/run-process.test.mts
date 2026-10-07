import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { mkdtemp, open, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { runProcess } from './run-process.mts'

const execFileAsync = promisify(execFile)

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
    const result = await runProcess('sh', ['-c', 'kill -TERM $$; exit 7'])

    expect(result).toMatchObject({ code: null, signal: 'SIGTERM', timedOut: false })
  })

  it('reports a timeout as timedOut with SIGTERM and a null code', async () => {
    const result = await runProcess('/bin/cat', [], { timeoutMs: 200 })

    expect(result).toMatchObject({
      code: null,
      signal: 'SIGTERM',
      timedOut: true,
      errno: undefined,
    })
  })

  it('keeps a requested zero-duration deadline enabled', async () => {
    const result = await runProcess('/bin/cat', [], { timeoutMs: 0 })
    expect(result).toMatchObject({ code: null, signal: 'SIGTERM', timedOut: true })
  })

  it.each([143, 0])(
    'reports a timeout even when a TERM trap makes the child exit %i',
    async exitCode => {
      // A trapped shutdown can make a killed child look like it exited normally by its
      // own code, including 0. timedOut must still be true, and the trap's exit code is
      // reported as-is rather than miscategorized as a normal exit.
      const result = await runProcess(
        '/bin/bash',
        ['-c', `trap 'exit ${exitCode}' TERM; read -r`],
        { timeoutMs: 200 },
      )

      expect(result).toMatchObject({
        code: exitCode,
        signal: null,
        timedOut: true,
        errno: undefined,
      })
    },
  )

  it.each([false, true])(
    'keeps the deadline while a descendant holds stdout open (parent exits early: %s)',
    async earlyExit => {
      const directory = await mkdtemp(join(tmpdir(), 'run-process-stdout-'))
      const fifo = join(directory, 'release')
      await execFileAsync('mkfifo', [fifo])
      await using release = await open(fifo, constants.O_RDWR)
      try {
        // The grandchild holds stdout until this test explicitly releases its FIFO read.
        // Awaiting pipe closure instead of the deadline would deadlock this assertion.
        const result = await runProcess(
          '/bin/bash',
          ['-c', `read -r < "$1" & ${earlyExit ? 'exit 0' : 'wait'}`, 'stdout-holder', fifo],
          { timeoutMs: 200 },
        )
        expect(result).toMatchObject({
          code: earlyExit ? 0 : null,
          signal: earlyExit ? null : 'SIGTERM',
          timedOut: true,
        })
      } finally {
        // Unlink before closing the writer so a late reader cannot block opening the FIFO.
        await unlink(fifo)
        await release.write('\n')
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it.each([false, true])(
    'keeps output-buffer failure priority (waits for deadline: %s)',
    async waitsForDeadline => {
      const handler = waitsForDeadline
        ? 'let signals = 0; process.on("SIGTERM", () => { if (++signals === 2) process.exit(0) });'
        : ''
      const result = await runProcess(
        process.execPath,
        [
          '-e',
          `${handler} process.stdout.write("x".repeat(1024 * 1024 + 1)); process.stdin.resume()`,
        ],
        { timeoutMs: 1000 },
      )
      expect(result).toMatchObject({
        code: null,
        errno: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        timedOut: false,
      })
    },
  )

  it('reports a spawn error via errno instead of coercing it to exit code 1', async () => {
    const missingBinary = join(tmpdir(), 'run-process-test-missing-binary')

    const result = await runProcess(missingBinary, [])

    expect(result).toMatchObject({ code: null, signal: null, timedOut: false, errno: 'ENOENT' })
  })
})
