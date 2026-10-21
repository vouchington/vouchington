import { createReadStream } from 'node:fs'
import { once } from 'node:events'
import { Readable, Writable } from 'node:stream'
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

  it('rejects an empty command, a non-positive timeout, and an already-aborted signal', async () => {
    await expect(runCommand({ command: '', timeoutMs: 1_000 })).rejects.toThrow(
      'command must not be empty',
    )
    await expect(runCommand({ command: node, timeoutMs: 0 })).rejects.toThrow(
      'timeoutMs must be a positive finite number',
    )
    const controller = new AbortController()
    controller.abort()
    const err = await rejectionOf(
      runCommand({ command: node, timeoutMs: 1_000, signal: controller.signal }),
    )
    expect(err).toBeInstanceOf(CommandFailedError)
    expect(err).toMatchObject({ reason: 'abort' })
  })

  it('writes string stdin and rejects when that stream or stdout fails', async () => {
    const text = await collectStdout(node, ['-e', 'process.stdin.pipe(process.stdout)'], 'hello')
    expect(text).toBe('hello')

    const stdin = new Readable({
      read() {
        this.destroy(new Error('stdin broke'))
      },
    })
    const stdinErr = await rejectionOf(
      runCommand({ command: node, args: ['-e', ''], stdin, timeoutMs: 2_000 }),
    )
    expect(stdinErr).toMatchObject({ message: 'stdin broke' })

    const stdout = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('stdout broke'))
      },
    })
    const stdoutErr = await rejectionOf(
      runCommand({
        command: node,
        args: ['-e', 'process.stdout.write("hi")'],
        stdout,
        timeoutMs: 2_000,
      }),
    )
    expect(stdoutErr).toMatchObject({ message: 'stdout broke' })
  })

  it('resolves only after a delayed stdout write finishes', async () => {
    const gate = Promise.withResolvers<(error?: Error | null) => void>()
    let settled = false
    const stdout = new Writable({
      write(_chunk, _encoding, callback) {
        gate.resolve(callback)
      },
    })
    const pending = runCommand({
      command: node,
      args: ['-e', 'process.stdout.write("hi")'],
      stdout,
      timeoutMs: 2_000,
    }).finally(() => {
      settled = true
    })
    const callback = await gate.promise
    expect(settled).toBe(false)
    callback()
    await expect(pending).resolves.toMatchObject({ stderr: expect.any(Buffer) })
    expect(settled).toBe(true)
  })

  it('rejects when a delayed stdout write fails after the child exits', async () => {
    const gate = Promise.withResolvers<(error?: Error | null) => void>()
    const stdout = new Writable({
      write(_chunk, _encoding, callback) {
        gate.resolve(callback)
      },
    })
    const pending = runCommand({
      command: node,
      args: ['-e', 'process.stdout.write("hi")'],
      stdout,
      timeoutMs: 2_000,
    })
    const settled = pending.then(
      value => ({ settled: 'fulfilled' as const, value }),
      (err: unknown) => ({ settled: 'rejected' as const, err }),
    )
    const callback = await gate.promise
    callback(Object.assign(new Error('disk write failed'), { code: 'EIO' }))
    await expect(settled).resolves.toMatchObject({
      settled: 'rejected',
      err: expect.objectContaining({ code: 'EIO' }),
    })
  })

  it('destroys a streamed stdin that the child never finishes', async () => {
    const source = createReadStream('/dev/zero')
    await once(source, 'open')
    const controller = new AbortController()
    const pending = runCommand({
      command: node,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      stdin: source,
      timeoutMs: 4_000,
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(CommandFailedError)
    await once(source, 'close')
    expect(source.destroyed).toBe(true)
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

async function collectStdout(
  command: string,
  args: readonly string[],
  stdin?: string,
): Promise<string> {
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
    stdin,
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
