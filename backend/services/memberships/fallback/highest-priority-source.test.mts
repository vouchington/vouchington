import type { QueryExecutor } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { getMembershipWorkLimits } from '../work-limits.mts'
import {
  getHighestPriorityFallbackSource,
  type ValidFallbackSource,
} from './highest-priority-source.mts'

function makeSource(
  index: number,
  overrides: Partial<ValidFallbackSource> = {},
): ValidFallbackSource {
  const id = `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`
  return {
    should_auto_renew: false,
    effective_at: new Date('2026-01-01T00:00:00.000Z'),
    expires_at: null,
    grant_created_at: null,
    has_open_grant_activation: false,
    membership_product_id: '00000000-0000-7000-8000-999999999999',
    membership_source_id: id,
    past_due_at: null,
    plan: 'plus',
    source_kind: 'family',
    ...overrides,
  }
}

describe('getHighestPriorityFallbackSource', () => {
  it('folds each keyset page without accumulating all rows and preserves FIFO queued grants across pages', async () => {
    const { batchSize } = getMembershipWorkLimits()
    const newerQueuedGrantOnPage1 = makeSource(batchSize, {
      source_kind: 'admin_grant',
      has_open_grant_activation: false,
      grant_created_at: new Date('2026-03-01T00:00:00.000Z'),
      effective_at: new Date('2026-03-01T00:00:00.000Z'),
    })
    const olderQueuedGrantOnPage2 = makeSource(batchSize + 1, {
      source_kind: 'admin_grant',
      has_open_grant_activation: false,
      grant_created_at: new Date('2026-01-15T00:00:00.000Z'),
      effective_at: new Date('2026-01-15T00:00:00.000Z'),
    })
    const page1 = [
      ...Array.from({ length: batchSize - 1 }, (_, i) =>
        makeSource(i + 1, { source_kind: 'family' }),
      ),
      newerQueuedGrantOnPage1,
    ]
    const page2 = [olderQueuedGrantOnPage2]
    const seenCursors: Array<string | null> = []
    const query = (async (input: string | { values?: unknown[] }) => {
      const values = typeof input === 'string' ? [] : (input.values ?? [])
      seenCursors.push((values[4] as string | null) ?? null)
      const rows = seenCursors.length === 1 ? page1 : page2
      return { rows, rowCount: rows.length }
    }) as unknown as QueryExecutor

    const selected = await getHighestPriorityFallbackSource(
      '00000000-0000-7000-8000-000000000000',
      '00000000-0000-7000-8000-000000000000',
      query,
    )

    expect(seenCursors).toEqual([null, newerQueuedGrantOnPage1.membership_source_id])
    expect(selected?.membership_source_id).toBe(olderQueuedGrantOnPage2.membership_source_id)
  })
})
