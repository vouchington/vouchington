import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import { addUrls } from '@services/urls/upsert'
import assert from 'http-assert'

/** URL registration commits before references are written; cache invalidation follows that commit. */
export async function materializeTopicRecommendationUrls(
  userId: string,
  exampleReferralLink: string | null | undefined,
  landingPageUrls: string[],
) {
  const inputs = [...(exampleReferralLink ? [exampleReferralLink] : []), ...landingPageUrls]
  const urls = await addUrls(userId, inputs, { skipCreatedEvents: true })
  const idsByUrl = new Map(urls.map(url => [url.url, url.id]))
  const resolve = (input: string) => {
    const id = idsByUrl.get(normalizeUrlForUrlTable(input).toString())
    assert(id, 422, 'Recommendation URLs must have public hostnames')
    return id
  }
  return {
    example_referral_url_id: exampleReferralLink ? resolve(exampleReferralLink) : null,
    landing_page_url_ids: [...new Set(landingPageUrls.map(resolve))],
  }
}
