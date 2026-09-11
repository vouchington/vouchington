import { describe, expect, it } from 'vitest'
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { flush, setLocalAppendFileForTest, writeRecord } from '../backend-local.mts'

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

function queueAtDrainSettlementBoundary(run: () => void, remainingReactions = 5): void {
  // Cross the append, Promise.all, batch, and inner-drain reactions to reach the old gap before
  // the exported flush continuation released ownership.
  if (remainingReactions === 0) {
    run()
    return
  }
  queueMicrotask(() => queueAtDrainSettlementBoundary(run, remainingReactions - 1))
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

describe('backend-local flush concurrency', () => {
  it('waits for an active flush before resolving a concurrent flush', async () => {
    await withLocalAnalytics(async () => {
      const appendStarted = Promise.withResolvers<void>()
      const appendReleased = Promise.withResolvers<void>()
      const restoreAppendFile = setLocalAppendFileForTest(async (filePath, data) => {
        appendStarted.resolve()
        await appendReleased.promise
        await appendFile(filePath, data, 'utf8')
      })
      try {
        writeRecord('queue_workers', makeRecord('first'))
        const firstFlushPromise = flush()
        await appendStarted.promise

        let concurrentFlushResolved = false
        const concurrentFlushPromise = flush().then(() => {
          concurrentFlushResolved = true
          return undefined
        })
        await new Promise(resolve => setImmediate(resolve))

        expect(concurrentFlushResolved).toBe(false)
        appendReleased.resolve()
        await Promise.all([firstFlushPromise, concurrentFlushPromise])
        expect(concurrentFlushResolved).toBe(true)
      } finally {
        appendReleased.resolve()
        try {
          await flush()
        } finally {
          restoreAppendFile()
        }
      }
    })
  })

  it('drains records added while a flush is in progress', async () => {
    await withLocalAnalytics(async localDir => {
      const appendStarted = Promise.withResolvers<void>()
      const appendReleased = Promise.withResolvers<void>()
      let appendCount = 0
      const restoreAppendFile = setLocalAppendFileForTest(async (filePath, data) => {
        appendCount += 1
        if (appendCount === 1) {
          appendStarted.resolve()
          await appendReleased.promise
        }
        await appendFile(filePath, data, 'utf8')
      })
      try {
        writeRecord('queue_workers', makeRecord('first'))
        const flushPromise = flush()
        await appendStarted.promise
        writeRecord('queue_workers', makeRecord('second'))
        appendReleased.resolve()
        await flushPromise

        const contents = await readFile(join(localDir, 'queue_workers', '2026-08-08.jsonl'), 'utf8')
        const eventIds = contents
          .split('\n')
          .filter(Boolean)
          .map(line => (JSON.parse(line) as { event_id: string }).event_id)
        expect(eventIds).toEqual(['first', 'second'])
        expect(appendCount).toBe(2)
      } finally {
        appendReleased.resolve()
        try {
          await flush()
        } finally {
          restoreAppendFile()
        }
      }
    })
  })

  it('starts a new drain when a record arrives as the active drain settles', async () => {
    await withLocalAnalytics(async localDir => {
      const boundaryWriteStarted = Promise.withResolvers<void>()
      let boundaryFlushPromise: Promise<void> | undefined
      let boundaryWriteScheduled = false
      const restoreAppendFile = setLocalAppendFileForTest(async (filePath, data) => {
        await appendFile(filePath, data, 'utf8')
        if (boundaryWriteScheduled) return
        boundaryWriteScheduled = true
        queueAtDrainSettlementBoundary(() => {
          writeRecord('queue_workers', makeRecord('at-drain-boundary'))
          boundaryFlushPromise = flush()
          boundaryWriteStarted.resolve()
        })
      })
      try {
        writeRecord('queue_workers', makeRecord('first'))
        const firstFlushPromise = flush()
        await boundaryWriteStarted.promise
        await Promise.all([firstFlushPromise, boundaryFlushPromise])

        const contents = await readFile(join(localDir, 'queue_workers', '2026-08-08.jsonl'), 'utf8')
        expect(contents).toContain('"event_id":"first"')
        expect(contents).toContain('"event_id":"at-drain-boundary"')
      } finally {
        try {
          await flush()
        } finally {
          restoreAppendFile()
        }
      }
    })
  })

  it('drains records added during a failed threshold flush before rejecting', async () => {
    await withLocalAnalytics(async localDir => {
      const appendStarted = Promise.withResolvers<void>()
      const appendReleased = Promise.withResolvers<void>()
      let appendCount = 0
      const restoreAppendFile = setLocalAppendFileForTest(async (filePath, data) => {
        appendCount += 1
        if (appendCount === 1) {
          appendStarted.resolve()
          await appendReleased.promise
          throw new Error('local append failed')
        }
        await appendFile(filePath, data, 'utf8')
      })
      try {
        for (let index = 0; index < 500; index += 1) {
          writeRecord('queue_workers', makeRecord(`failed-batch-${index}`))
        }
        await appendStarted.promise
        writeRecord('queue_workers', makeRecord('accepted-during-failure'))
        const flushPromise = flush()
        appendReleased.resolve()

        await expect(flushPromise).rejects.toThrow('local append failed')
        const contents = await readFile(join(localDir, 'queue_workers', '2026-08-08.jsonl'), 'utf8')
        expect(contents).toContain('"event_id":"accepted-during-failure"')
        expect(contents).not.toContain('"event_id":"failed-batch-0"')
        expect(appendCount).toBe(2)
      } finally {
        appendReleased.resolve()
        try {
          await flush()
        } finally {
          restoreAppendFile()
        }
      }
    })
  })
})
