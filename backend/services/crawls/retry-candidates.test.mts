import { expect, it, describe } from 'vitest'
import { addUrl } from '@services/urls'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { getRetryCrawlUrlCandidates } from './retry-candidates.mts'

describe('retry-candidates', () => {
  it('getRetryCrawlUrlCandidates returns null for missing URL', async () => {
    const result = await getRetryCrawlUrlCandidates('00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })

  it('getRetryCrawlUrlCandidates returns null when no other candidates exist', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(null, `https://retry-solo-${random}.example.com/page`)
    await updateUrlHostname(url!.hostname.id, { crawlable: true })

    // Only one URL on this hostname, excluding it leaves no candidates
    const result = await getRetryCrawlUrlCandidates(url!.id)
    expect(result).toBeNull()
  })

  it('getRetryCrawlUrlCandidates returns candidates from the same hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const base = `https://retry-multi-${random}.example.com`
    const [url1] = await Promise.all([
      addUrl(null, `${base}/page1`),
      addUrl(null, `${base}/page2`),
      addUrl(null, `${base}/page3`),
    ])
    await updateUrlHostname(url1!.hostname.id, { crawlable: true })

    const result = await getRetryCrawlUrlCandidates(url1!.id)
    expect(result).not.toBeNull()
    expect(result!.hostnameId).toBe(url1!.hostname.id)
    expect(result!.urlIds).not.toContain(url1!.id)
    expect(result!.urlIds.length).toBeGreaterThan(0)
  })
})
