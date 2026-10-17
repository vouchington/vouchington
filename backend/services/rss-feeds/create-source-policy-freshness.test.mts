import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUrlHostname, WEB_PROVENANCE } from '@voucha/test-helpers'
import { updateUrlHostnameBlocked } from '../../test-helpers/entities/url-hostnames/mutations.mts'
import { createSourceFromUrl } from './create-source.mts'

describe('source creation policy freshness', () => {
  it.each(['fallback', 'classified'] as const)(
    'rejects a hostname blocked during the first fetch before %s proceeds',
    async phase => {
      const user = await createTestUser()
      const hostname = `rss-fresh-${crypto.randomUUID()}.example.com`
      const hostnameId = await insertTestUrlHostname({ hostname })
      const httpsUrl = `https://${hostname}/feed.xml`
      const input = phase === 'fallback' ? `http://${hostname}/feed.xml` : httpsUrl
      const fetched: string[] = []
      await expect(
        createSourceFromUrl(user, WEB_PROVENANCE, input, {
          follow: false,
          fetchAndClassifyFeedImpl: async url => {
            fetched.push(url)
            await updateUrlHostnameBlocked(hostnameId!, true)
            if (phase === 'fallback') throw new Error('Owned HTTPS transport failure')
            return { kind: 'feed', title: 'Owned feed', feedType: 'article' }
          },
        }),
      ).rejects.toMatchObject({ status: 400, message: `Domain is blocked: ${hostname}` })
      expect(fetched).toEqual([httpsUrl])
    },
  )
})
