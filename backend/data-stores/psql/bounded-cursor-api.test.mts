import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import {
  createAsyncGeneratorFromCursor,
  executeHandlerWithCursorInBatches,
  read,
} from './setup.mts'

describe('bounded cursor execution', () => {
  it('reports progress after SQLInput handlers with second-argument options', async () => {
    const events: string[] = []
    const rows: number[] = []
    const result = await executeHandlerWithCursorInBatches<{ id: number }>(
      sql`/* boundedCursorObject */ SELECT generate_series(1, ${4}) AS id ORDER BY id`,
      {
        batchSize: 1,
        maxRows: 2,
        handler: async batch => {
          rows.push(...batch.map(row => row.id))
          events.push('handled')
        },
        onComplete: progress => {
          expect(progress.rowsRead).toBe(2)
          events.push('completed')
        },
      },
    )
    expect(rows).toEqual([1, 2])
    expect(result).toEqual({ rowsRead: 2, hasMore: true, lastRow: { id: 2 } })
    expect(events).toEqual(['handled', 'handled', 'completed'])
  })

  it('supports explicit values and reports a drained final page', async () => {
    const rows: number[] = []
    let completions = 0
    const result = await executeHandlerWithCursorInBatches<{ id: number }>(
      '/* boundedCursorValues */ SELECT generate_series(1, $1::integer) AS id ORDER BY id',
      [2],
      {
        batchSize: 3,
        maxRows: 3,
        handler: async batch => {
          rows.push(...batch.map(row => row.id))
        },
        onComplete: () => {
          completions++
        },
      },
    )
    expect(rows).toEqual([1, 2])
    expect(result).toEqual({ rowsRead: 2, hasMore: false, lastRow: { id: 2 } })
    expect(completions).toBe(1)
  })

  it('closes an early-stopped cursor and conservatively reports remaining work', async () => {
    let progress: unknown
    for await (const row of createAsyncGeneratorFromCursor<{ id: number }>(
      sql`/* boundedCursorEarlyStop */ SELECT generate_series(1, 4) AS id`,
      {
        batchSize: 1,
        maxRows: 3,
        onComplete: result => {
          progress = result
        },
      },
    )) {
      expect(row.id).toBe(1)
      break
    }
    expect(progress).toEqual({ rowsRead: 1, hasMore: true, lastRow: { id: 1 } })
    expect(
      (await read<{ ready: number }>('/* boundedCursorClosed */ SELECT 1 AS ready')).rows,
    ).toEqual([{ ready: 1 }])
  })

  it('does not acknowledge completion when a handler fails', async () => {
    let completed = false
    await expect(
      executeHandlerWithCursorInBatches<{ id: number }>(
        sql`/* boundedCursorFailure */ SELECT 1 AS id`,
        {
          batchSize: 1,
          maxRows: 1,
          handler: async () => {
            throw new Error('handler failed')
          },
          onComplete: () => {
            completed = true
          },
        },
      ),
    ).rejects.toThrow('handler failed')
    expect(completed).toBe(false)
  })
})
