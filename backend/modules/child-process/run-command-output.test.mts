import { PassThrough, Readable, Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { runCommand } from './run-command.mts'

const node = process.execPath

describe('runCommand stdout settlement', () => {
  it('finishes writing to a PassThrough without waiting for its readable side', async () => {
    const stdout = new PassThrough()
    await expect(
      runCommand({
        command: node,
        args: ['-e', 'process.stdout.write("hi")'],
        stdout,
        timeoutMs: 2_000,
      }),
    ).resolves.toMatchObject({ stderr: expect.any(Buffer) })
    expect(stdout.read().toString()).toBe('hi')
  })

  it('keeps cancellation active while a stdout write settles after source end', async () => {
    const controller = new AbortController()
    const writeStarted = Promise.withResolvers<void>()
    const sourceEnded = Promise.withResolvers<void>()
    const stdout = new Writable({
      write() {
        writeStarted.resolve()
      },
    })
    stdout.on('pipe', (source: Readable) => {
      source.once('end', () => sourceEnded.resolve())
    })
    const pending = runCommand({
      command: node,
      args: ['-e', 'process.stdout.write("hi")'],
      stdout,
      timeoutMs: 2_000,
      signal: controller.signal,
    })
    const rejection = pending.catch((err: unknown) => err)
    await writeStarted.promise
    await sourceEnded.promise
    controller.abort()
    expect(await rejection).toMatchObject({ reason: 'abort' })
    expect(stdout.destroyed).toBe(true)
  })

  it('keeps the deadline active while a stdout write settles after source end', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const writeStarted = Promise.withResolvers<void>()
      const sourceEnded = Promise.withResolvers<void>()
      const stdout = new Writable({
        write() {
          writeStarted.resolve()
        },
      })
      stdout.on('pipe', (source: Readable) => {
        source.once('end', () => sourceEnded.resolve())
      })
      const pending = runCommand({
        command: node,
        args: ['-e', 'process.stdout.write("hi")'],
        stdout,
        timeoutMs: 200,
      })
      const rejection = pending.catch((err: unknown) => err)
      await writeStarted.promise
      await sourceEnded.promise
      await vi.advanceTimersByTimeAsync(200)
      expect(await rejection).toMatchObject({ reason: 'timeout' })
      expect(stdout.destroyed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
