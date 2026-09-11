import { it, expect, describe } from 'vitest'
import { updateUrl } from './update.mts'
import { addUrl } from './upsert.mts'

describe('update.generated', () => {
  it('updateUrl sets canonical_url_id', async () => {
    const url1 = await addUrl(null, 'https://example.com/original')
    const url2 = await addUrl(null, 'https://example.com/canonical')
    const updated = await updateUrl(url1!.id, { canonical_url_id: url2!.id })
    expect(updated).toBeDefined()
    expect(updated!.canonical_url_id).toBe(url2!.id)
  })

  it('updateUrl returns null when no updates provided', async () => {
    const url = await addUrl(null, 'https://example.com/test')
    const updated = await updateUrl(url!.id, {})
    expect(updated).toBeNull()
  })
})
