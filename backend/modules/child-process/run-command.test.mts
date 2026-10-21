import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { CommandFailedError, runCommand } from './run-command.mts'

const node = process.execPath

describe('runCommand', () => {
  it('rejects a non-zero exit and keeps the capped stderr', async () => {
    const err = await rejectionOf(
      runCommand({
        command: node,
        args: ['-e', 'process.stderr.write("boom"); process.exit(7)'],
        timeoutMs: 2_000,
      }),
    )
    expect(err).toBeInstanceOf(CommandFailedError)
    expect(err).toMatchObject({ reason: 'exit', exitCode: 7, signal: null })
    expect((err as CommandFailedError).stderr.toString('utf8')).toBe('boom')
  })

  it('rejects when the child dies from a signal', async () => {
    const err = await rejectionOf(
      runCommand({
        command: node,
        args: ['-e', 'process.kill(process.pid, "SIGTERM")'],
        timeoutMs: 2_000,
      }),
    )
    expect(err).toBeInstanceOf(CommandFailedError)
    expect(err).toMatchObject({ reason: 'signal', signal: 'SIGTERM' })
  })

  it('kills the child when the abort signal fires', async () => {
    const controller = new AbortController()
    const pending = runCommand({
      command: node,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      timeoutMs: 4_000,
      signal: controller.signal,
    })
    controller.abort()
    const err = await rejectionOf(pending)
    expect(err).toBeInstanceOf(CommandFailedError)
    expect(err).toMatchObject({ reason: 'abort' })
  })

  it('kills the child when the timeout fires', async () => {
    const err = await rejectionOf(
      runCommand({
        command: node,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        timeoutMs: 200,
      }),
    )
    expect(err).toBeInstanceOf(CommandFailedError)
    expect(err).toMatchObject({ reason: 'timeout' })
  })

  it('caps retained stderr and still drains the rest', async () => {
    const { stderr } = await runCommand({
      command: node,
      args: ['-e', 'process.stderr.write("x".repeat(50_000))'],
      timeoutMs: 2_000,
      stderrCapBytes: 128,
    })
    expect(stderr).toHaveLength(128)
    expect(stderr.toString('utf8')).toBe('x'.repeat(128))
  })

  it('forces LC_ALL=C and passes argv literally', async () => {
    const text = await collectStdout(node, [
      '-e',
      'process.stdout.write(`${process.env.LC_ALL}\\n${process.argv[1]}`)',
      'a; rm -rf /',
    ])
    expect(text).toBe('C\na; rm -rf /')
  })
})

async function collectStdout(command: string, args: readonly string[]): Promise<string> {
  const chunks: Buffer[] = []
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })
  await runCommand({
    command,
    args,
    stdout,
    timeoutMs: 2_000,
    env: { LC_ALL: 'en_US.UTF-8' },
  })
  return Buffer.concat(chunks).toString('utf8')
}

async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending
  } catch (err) {
    return err
  }
  throw new Error('expected the command to fail')
}
