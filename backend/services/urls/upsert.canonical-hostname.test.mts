import { describe, expect, it } from 'vitest'
import { setCanonicalUrl } from './set-canonical.mts'
import { addUrl } from './upsert.mts'

describe('addUrl canonical hostname', () => {
  it('returns the canonical target hostname from a statement after the upsert', async () => {
    const runId = crypto.randomUUID()
    const source = await addUrl(null, `https://source-${runId}.example.com/page`)
    const canonical = await addUrl(null, `https://canonical-${runId}.example.com/page`)
    if (!source || !canonical) throw new Error('fixture URLs must be created')
    expect(source.canonical_hostname_id).toBe(source.hostname.id)

    await setCanonicalUrl(source.id, canonical.id)
    const refreshed = await addUrl(null, source.url)

    expect(refreshed?.canonical_url_id).toBe(canonical.id)
    expect(refreshed?.hostname.id).toBe(source.hostname.id)
    expect(refreshed?.canonical_hostname_id).toBe(canonical.hostname.id)
  })
})
