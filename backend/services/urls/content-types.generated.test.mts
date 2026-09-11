import crypto from 'node:crypto'
import { expect, it, describe } from 'vitest'
import { upsertUrlContentTypes } from './content-types.mts'
import { beginTransaction, getUrlContentTypesSequenceCurrentValue } from '@voucha/test-helpers'

describe('content-types.generated', () => {
  it('upsertUrlContentTypes returns one row for concurrent inserts of the same MIME type', async () => {
    const mimeType = `application/x-test-${crypto.randomUUID()}`

    const ids = await Promise.all(Array.from({ length: 8 }, () => upsertUrlContentTypes(mimeType)))

    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBeTruthy()
  })

  it('upsertUrlContentTypes normalizes MIME type case', async () => {
    const mimeType = `Application/X-Test-${crypto.randomUUID()}`
    const firstId = await upsertUrlContentTypes(mimeType)
    const secondId = await upsertUrlContentTypes(mimeType.toLowerCase())

    expect(secondId).toBe(firstId)
  })

  it('upsertUrlContentTypes does not advance the identity sequence for existing rows', async () => {
    const mimeType = `application/x-sequence-test-${crypto.randomUUID()}`

    await using query = await beginTransaction()
    const firstId = await upsertUrlContentTypes(mimeType, { query })
    const before = await getUrlContentTypesSequenceCurrentValue({ query })

    const ids = await Promise.all(
      Array.from({ length: 8 }, () => upsertUrlContentTypes(mimeType, { query })),
    )
    const after = await getUrlContentTypesSequenceCurrentValue({ query })

    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe(firstId)
    expect(after).toBe(before)
    await query.commit()
  })
})
