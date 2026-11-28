import { describe, expect, it } from 'vitest'
import { collectKeysetPages, drainBatchedWrite } from './bounded-reads.mts'

describe('copyright-notices bounded-reads helpers', () => {
  it('collectKeysetPages advances cursor across full pages until a short page', async () => {
    const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }, { id: 'd' }], [{ id: 'e' }]]
    const seenCursors: Array<string | null> = []
    const rows = await collectKeysetPages<{ id: string }>(2, async (after, limit) => {
      seenCursors.push(after?.id ?? null)
      expect(limit).toBe(2)
      return pages[seenCursors.length - 1] ?? []
    })
    expect(seenCursors).toEqual([null, 'b', 'd'])
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }])
  })

  it('drainBatchedWrite repeats until a batch updates fewer rows than batchSize', async () => {
    const counts = [2, 2, 1]
    let calls = 0
    const total = await drainBatchedWrite(2, async limit => {
      expect(limit).toBe(2)
      return counts[calls++] ?? 0
    })
    expect(calls).toBe(3)
    expect(total).toBe(5)
  })
})
