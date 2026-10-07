import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { flush, writeRecord } from '../backend-local.mts'

function makeRecord(eventId: string) {
  return {
    event_time: new Date('2026-08-08T00:00:00.000Z'),
    event_date: '2026-08-08',
    event_id: eventId,
    env: 'test',
    queue: 'psql',
    event: 'active',
  }
}

async function withLocalAnalytics(run: (localDir: string) => Promise<void>): Promise<void> {
  const originalLocalDir = process.env.ANALYTICS_LOCAL_DIR
  await flush()
  const localDir = await mkdtemp(join(tmpdir(), 'analytics-local-flush-'))
  process.env.ANALYTICS_LOCAL_DIR = localDir
  try {
    await run(localDir)
  } finally {
    try {
      await flush()
    } finally {
      if (originalLocalDir === undefined) delete process.env.ANALYTICS_LOCAL_DIR
      else process.env.ANALYTICS_LOCAL_DIR = originalLocalDir
      await rm(localDir, { recursive: true, force: true })
    }
  }
}

async function withAppendFileMock(
  intercept: (filePath: string, data: string, append: () => Promise<void>) => Promise<void>,
  run: () => Promise<void>,
): Promise<void> {
  const unmockedAppendFile = fs.promises.appendFile
  const originalAppendFile = (filePath: string, data: string, options: 'utf8') =>
    Reflect.apply(unmockedAppendFile, fs.promises, [filePath, data, options]) as Promise<void>
  const appendFileSpy = vi
    .spyOn(fs.promises, 'appendFile')
    .mockImplementation((filePath, data, options) => {
      if (typeof filePath !== 'string' || typeof data !== 'string' || options !== 'utf8') {
        throw new Error('Unexpected local analytics appendFile arguments')
      }
      return intercept(filePath, data, () => originalAppendFile(filePath, data, options))
    })
  try {
    await run()
  } finally {
    appendFileSpy.mockRestore()
  }
}

describe('backend-local flush concurrency', () => {
  it('waits for an active flush before resolving a concurrent flush', async () => {
    await withLocalAnalytics(async () => {
      const events: string[] = []
      const appendStarted = Promise.withResolvers<void>()
      const appendReleased = Promise.withResolvers<void>()
      await withAppendFileMock(
        async (_filePath, _data, append) => {
          appendStarted.resolve()
          await appendReleased.promise
          await append()
          events.push('append finished')
        },
        async () => {
          try {
            writeRecord('queue_workers', makeRecord('first'))
            const firstFlushPromise = flush()
            await appendStarted.promise

            const concurrentFlushPromise = flush().then(() => {
              events.push('concurrent flush finished')
              return undefined
            })
            appendReleased.resolve()
            await Promise.all([firstFlushPromise, concurrentFlushPromise])
            expect(events).toEqual(['append finished', 'concurrent flush finished'])
          } finally {
            appendReleased.resolve()
            await flush()
          }
        },
      )
    })
  })

  it('drains records added while a flush is in progress', async () => {
    await withLocalAnalytics(async localDir => {
      const appendStarted = Promise.withResolvers<void>()
      const appendReleased = Promise.withResolvers<void>()
      let appendCount = 0
      await withAppendFileMock(
        async (_filePath, _data, append) => {
          appendCount += 1
          if (appendCount === 1) {
            appendStarted.resolve()
            await appendReleased.promise
          }
          await append()
        },
        async () => {
          try {
            writeRecord('queue_workers', makeRecord('first'))
            const flushPromise = flush()
            await appendStarted.promise
            writeRecord('queue_workers', makeRecord('second'))
            appendReleased.resolve()
            await flushPromise

            const contents = await readFile(
              join(localDir, 'queue_workers', '2026-08-08.jsonl'),
              'utf8',
            )
            const eventIds = contents
              .split('\n')
              .filter(Boolean)
              .map(line => (JSON.parse(line) as { event_id: string }).event_id)
            expect(eventIds).toEqual(['first', 'second'])
            expect(appendCount).toBe(2)
          } finally {
            appendReleased.resolve()
            await flush()
          }
        },
      )
    })
  })

  it('starts a new drain for records added after the previous flush', async () => {
    await withLocalAnalytics(async localDir => {
      writeRecord('queue_workers', makeRecord('first'))
      await flush()
      writeRecord('queue_workers', makeRecord('after-drain-settlement'))
      await flush()

      const contents = await readFile(join(localDir, 'queue_workers', '2026-08-08.jsonl'), 'utf8')
      const eventIds = contents
        .split('\n')
        .filter(Boolean)
        .map(line => (JSON.parse(line) as { event_id: string }).event_id)
      expect(eventIds).toEqual(['first', 'after-drain-settlement'])
    })
  })

  it('drains records added during a failed threshold flush before rejecting', async () => {
    await withLocalAnalytics(async localDir => {
      const appendStarted = Promise.withResolvers<void>()
      const appendReleased = Promise.withResolvers<void>()
      let appendCount = 0
      await withAppendFileMock(
        async (_filePath, _data, append) => {
          appendCount += 1
          if (appendCount === 1) {
            appendStarted.resolve()
            await appendReleased.promise
            throw new Error('local append failed')
          }
          await append()
        },
        async () => {
          try {
            for (let index = 0; index < 500; index += 1) {
              writeRecord('queue_workers', makeRecord(`failed-batch-${index}`))
            }
            await appendStarted.promise
            writeRecord('queue_workers', makeRecord('accepted-during-failure'))
            const flushPromise = flush()
            appendReleased.resolve()

            await expect(flushPromise).rejects.toThrow('local append failed')
            const contents = await readFile(
              join(localDir, 'queue_workers', '2026-08-08.jsonl'),
              'utf8',
            )
            expect(contents).toContain('"event_id":"accepted-during-failure"')
            expect(contents).not.toContain('"event_id":"failed-batch-0"')
            expect(appendCount).toBe(2)
          } finally {
            appendReleased.resolve()
            await flush()
          }
        },
      )
    })
  })
})
