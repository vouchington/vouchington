import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import { getUrlHostnameById } from '@services/urls-hostnames/get'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { addUrls } from './upsert.mts'

describe('URL hostname invalidation', () => {
  it('enqueues cold and private promotions once, then drains after commit', async () => {
    const suffix = crypto.randomUUID()
    const cold = `cold-${suffix}.example.com`
    const privateHostname = `private-${suffix}.example.com`
    const publicHostname = `public-${suffix}.example.com`
    const privateId = (await upsertUrlHostnames(null, [privateHostname], {}, 'private_email')).get(
      privateHostname,
    )!
    const publicId = (await upsertUrlHostnames(null, [publicHostname])).get(publicHostname)!

    await using query = await beginTransaction()
    const { result: urls, queries: beforeCommit } = await withCapturedTestQueries(() =>
      addUrls(
        null,
        [cold, privateHostname, publicHostname].map(hostname => `https://${hostname}/`),
        { query },
      ),
    )
    const coldId = urls.find(url => url.hostname.hostname === cold)?.hostname.id
    if (!coldId) throw new Error('Cold URL hostname was not created')
    const enqueues = beforeCommit.filter(query =>
      query.text.includes('/* enqueueHostnameCacheInvalidation */'),
    )
    expect(enqueues).toHaveLength(1)
    expect((enqueues[0]!.values[0] as string[]).toSorted()).toEqual([coldId, privateId].toSorted())
    expect(
      countCapturedQueriesByAnnotation(
        beforeCommit,
        'drainHostnameCacheInvalidationWork:claimAvailable',
      ),
    ).toBe(0)

    const { queries: afterCommit } = await withCapturedTestQueries(() => query.commit())
    expect(
      countCapturedQueriesByAnnotation(
        afterCommit,
        'drainHostnameCacheInvalidationWork:claimAvailable',
      ),
    ).toBe(1)
    const completions = afterCommit.filter(query =>
      query.text.includes('/* drainHostnameCacheInvalidationWork:complete */'),
    )
    expect(completions).toHaveLength(1)
    const completed = JSON.parse(completions[0]!.values[0] as string) as Array<{
      url_hostname_id: string
    }>
    expect(completed.map(row => row.url_hostname_id).toSorted()).toEqual(
      [coldId, privateId].toSorted(),
    )
    expect((await getUrlHostnameById(coldId))?.publicly_introduced_at).toBeInstanceOf(Date)
    expect((await getUrlHostnameById(privateId))?.publicly_introduced_at).toBeInstanceOf(Date)
    expect((await getUrlHostnameById(publicId))?.publicly_introduced_at).toBeInstanceOf(Date)
  })
})
