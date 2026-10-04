import crypto from 'node:crypto'
import { expect, it, describe } from 'vitest'
import { upsertMediaTypes } from './media-types.mts'
import { beginTransaction, getMediaTypesSequenceCurrentValue } from '@voucha/test-helpers'

describe('media-types.generated', () => {
  it('upsertMediaTypes returns one row for concurrent inserts of the same MIME type', async () => {
    const mimeType = `application/x-test-${crypto.randomUUID()}`

    const ids = await Promise.all(Array.from({ length: 8 }, () => upsertMediaTypes(mimeType)))

    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBeTruthy()
  })

  it('upsertMediaTypes normalizes MIME type case', async () => {
    const mimeType = `Application/X-Test-${crypto.randomUUID()}`
    const firstId = await upsertMediaTypes(mimeType)
    const secondId = await upsertMediaTypes(mimeType.toLowerCase())

    expect(secondId).toBe(firstId)
  })

  it('upsertMediaTypes does not advance the identity sequence for existing rows', async () => {
    const mimeType = `application/x-sequence-test-${crypto.randomUUID()}`

    await using query = await beginTransaction()
    const firstId = await upsertMediaTypes(mimeType, { query })
    const before = await getMediaTypesSequenceCurrentValue({ query })

    const ids = await Promise.all(
      Array.from({ length: 8 }, () => upsertMediaTypes(mimeType, { query })),
    )
    const after = await getMediaTypesSequenceCurrentValue({ query })

    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe(firstId)
    expect(after).toBe(before)
    await query.commit()
  })

  it.each(['not-a-mime-type', `application/${'x'.repeat(256)}`, ''])(
    'rejects invalid MIME %s before storage',
    async mimeType => {
      await expect(upsertMediaTypes(mimeType)).rejects.toMatchObject({ status: 422 })
    },
  )

  it('accepts MIME token punctuation and normalizes whitespace before insertion', async () => {
    const mimeType = `application/x-test~${crypto.randomUUID()}+json`
    await expect(upsertMediaTypes(` ${mimeType.toUpperCase()} `)).resolves.toBe(
      await upsertMediaTypes(mimeType),
    )
  })
})
