import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { spoolFeedBody } from '../../backend/scripts/validate-seed-rss-feeds/probe.mts'

describe('seed RSS probe body spooling', () => {
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map(directory => rm(directory, { force: true, recursive: true })),
    )
  })

  async function temporaryRoot(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'rss-probe-test-'))
    directories.push(directory)
    return directory
  }

  it('persists every chunk before parsing and removes its temporary directory', async () => {
    const root = await temporaryRoot()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('<rss>'))
        controller.enqueue(Buffer.from('complete</rss>'))
        controller.close()
      },
    })

    await expect(spoolFeedBody(new Response(body), root)).resolves.toEqual(
      Buffer.from('<rss>complete</rss>'),
    )
    await expect(readdir(root)).resolves.toEqual([])
  })

  it('cancels an oversized response and still removes its temporary directory', async () => {
    const root = await temporaryRoot()
    let cancelled = false
    const chunk = Buffer.alloc(64 * 1024)
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk)
      },
      cancel() {
        cancelled = true
      },
    })

    await expect(spoolFeedBody(new Response(body), root)).rejects.toThrow('feed body exceeds')
    expect(cancelled).toBe(true)
    await expect(readdir(root)).resolves.toEqual([])
  })
})
