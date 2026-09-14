import { describe, expect, it, vi } from 'vitest'
import { selectAuthoritativeMicrosoftStoreRecords } from './authoritative-record-selection.mts'
import type { MicrosoftStoreCollectionItem, MicrosoftStoreRecurrence } from './types.mts'

const collection: MicrosoftStoreCollectionItem = {
  id: 'collection-1',
  recurrenceData: 'recurrence-1',
  productId: '9TESTPRODUCT',
  skuId: '0001',
  modifiedDate: '2026-09-01T00:00:00Z',
  endDate: '2027-01-01T00:00:00Z',
  status: 'Active',
}
const recurrence: MicrosoftStoreRecurrence = {
  id: 'recurrence-1',
  productId: '9TESTPRODUCT',
  skuId: '0001',
  startTime: '2026-08-01T00:00:00Z',
  recurrenceState: 'Active',
  expirationTime: '2027-01-01T00:00:00Z',
  lastModified: '2026-09-01T00:00:00Z',
}

describe('Microsoft Store corroborated record selection', () => {
  it('treats a matching recurrence ID with a lagging product or SKU as pending propagation', () => {
    for (const mismatch of [{ productId: 'other-product' }, { skuId: 'other-sku' }]) {
      expect(
        selectAuthoritativeMicrosoftStoreRecords({
          collections: [collection],
          recurrences: [{ ...recurrence, ...mismatch }],
          productId: '9TESTPRODUCT',
          skuId: '0001',
        }),
      ).toEqual({ kind: 'lag' })
    }
  })

  it('selects only the recurrence requested by source recovery', () => {
    const older = {
      ...recurrence,
      id: 'recurrence-older',
      lastModified: '2026-09-01T00:00:00Z',
    }
    const newer = {
      ...recurrence,
      id: 'recurrence-newer',
      lastModified: '2026-09-02T00:00:00Z',
    }
    expect(
      selectAuthoritativeMicrosoftStoreRecords({
        collections: [
          { ...collection, id: 'collection-older', recurrenceData: older.id, status: 'Revoked' },
          { ...collection, id: 'collection-newer', recurrenceData: newer.id },
        ],
        recurrences: [older, newer],
        productId: '9TESTPRODUCT',
        skuId: '0001',
        recurrenceId: older.id,
      }),
    ).toMatchObject({ kind: 'matched', recurrence: { id: older.id } })
  })

  it('prefers a currently entitling dunning renewal over a newer expired Active recurrence', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-12T00:00:00Z'))
      const dunning = {
        ...recurrence,
        id: 'recurrence-2',
        recurrenceState: 'InDunning' as const,
        expirationTime: '2026-09-10T00:00:00Z',
        expirationTimeWithGrace: '2026-10-01T00:00:00Z',
        lastModified: '2026-09-10T00:00:00Z',
      }
      const expiredActive = {
        ...recurrence,
        expirationTime: '2026-09-11T00:00:00Z',
        lastModified: '2026-09-11T00:00:00Z',
      }
      expect(
        selectAuthoritativeMicrosoftStoreRecords({
          collections: [
            collection,
            { ...collection, id: 'collection-2', recurrenceData: 'recurrence-2' },
          ],
          recurrences: [expiredActive, dunning],
          productId: '9TESTPRODUCT',
          skuId: '0001',
        }),
      ).toMatchObject({ kind: 'matched', recurrence: { id: 'recurrence-2' } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not rank a revoked Collections item as entitling despite an Active recurrence', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-12T00:00:00Z'))
      const validDunning = {
        ...recurrence,
        id: 'recurrence-2',
        recurrenceState: 'InDunning' as const,
        expirationTimeWithGrace: '2026-10-01T00:00:00Z',
        lastModified: '2026-09-09T00:00:00Z',
      }
      expect(
        selectAuthoritativeMicrosoftStoreRecords({
          collections: [
            { ...collection, status: 'Revoked' },
            { ...collection, id: 'collection-2', recurrenceData: 'recurrence-2' },
          ],
          recurrences: [recurrence, validDunning],
          productId: '9TESTPRODUCT',
          skuId: '0001',
        }),
      ).toMatchObject({ kind: 'matched', recurrence: { id: 'recurrence-2' } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('prefers a valid active term to newer invalid or future-start candidates', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-12T00:00:00Z'))
      const validCollection = {
        ...collection,
        id: 'collection-valid',
        recurrenceData: 'recurrence-valid',
      }
      const validRecurrence = {
        ...recurrence,
        id: 'recurrence-valid',
        lastModified: '2026-09-09T00:00:00Z',
      }
      for (const invalid of [
        { collection: { ...collection, endDate: '2026-09-13T00:00:00Z' }, recurrence },
        {
          collection: { ...collection, startDate: '2026-09-13T00:00:00Z' },
          recurrence: { ...recurrence, startTime: '2026-09-13T00:00:00Z' },
        },
      ]) {
        expect(
          selectAuthoritativeMicrosoftStoreRecords({
            collections: [invalid.collection, validCollection],
            recurrences: [invalid.recurrence, validRecurrence],
            productId: '9TESTPRODUCT',
            skuId: '0001',
          }),
        ).toMatchObject({ kind: 'matched', recurrence: { id: 'recurrence-valid' } })
      }
    } finally {
      vi.useRealTimers()
    }
  })
})
