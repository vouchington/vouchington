import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { sweepNextBoilerplateHostnameBatch, type BoilerplateSweepContinuation } from './sweep.mts'
import type { ParentPathCandidate } from './search.mts'

describe('boilerplate hostname handoff', () => {
  it('continues to the next hostname after an empty URL page without advancing the shared cursor', async () => {
    const first = await insertTestUrlHostname({
      hostname: `empty-first-${randomUUID()}.example.com`,
    })
    const second = await insertTestUrlHostname({
      hostname: `empty-second-${randomUUID()}.example.com`,
    })
    const batch = { hostnameIds: [first, second], previousCursor: randomUUID(), nextCursor: second }
    const admitted: ParentPathCandidate[][] = []
    const continued: BoilerplateSweepContinuation[] = []
    const { result, queries } = await withCapturedTestQueries(() =>
      sweepNextBoilerplateHostnameBatch(
        { hostnameBatchSize: 2, candidateLimit: 1 },
        async candidates => {
          admitted.push(candidates)
        },
        async continuation => {
          continued.push(continuation)
        },
        batch,
      ),
    )
    expect(result).toEqual([])
    expect(admitted).toEqual([[]])
    expect(continued).toEqual([{ ...batch, hostnameIds: [second], after: undefined }])
    expect(
      queries.some(query => query.text.includes('advanceBoilerplateRemovalHostnameCursor')),
    ).toBe(false)
  })
})
