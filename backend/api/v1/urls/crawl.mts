import app from '../../app.mts'
import { requireAuth } from '../../response-helpers.mts'
import {
  currentUserCanViewCrawlHistory,
  currentUserCanTriggerCrawl,
} from '@services/urls/authorization'
import { getMembershipByUserId } from '@services/memberships'
import { getUrlByAnyCached } from '@services/entity-fetch/get'
import { getCrawlById, getPublicUrlCrawlDetailById } from '@services/crawls'
import { currentUserCanFilterHostnameModeration } from '@services/urls-hostnames'
import { buildSideloadImageUrl } from '@ts-shared/url-signing'
import { getImageOrigin } from '@modules/utils/image-origin'
import { getSigningKeys } from '@services/rss-feed-items/signing-keys'
import { apiResponse } from '../../response-contract.mts'

app.route('/api/v1/urls/:id/crawls/:crawlId').get(async ctx => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/urls/:id/crawls/:crawlId')

  const membership = currentUserCanTriggerCrawl(currentUser)
    ? null
    : await getMembershipByUserId(currentUser.id)
  if (!currentUserCanViewCrawlHistory(currentUser, membership)) {
    return ctx.throw(403, 'Premium membership required')
  }

  const urlId = ctx.params.id!
  const url = await getUrlByAnyCached(urlId)
  if (!url) return ctx.throw(404, 'URL not found')

  const canSeeModeration = currentUserCanFilterHostnameModeration(currentUser)
  if (url.hostname?.blocked && !canSeeModeration) return ctx.throw(404, 'URL not found')

  const canViewHeaders = currentUserCanTriggerCrawl(currentUser)
  if (!canViewHeaders) {
    const crawl = await getPublicUrlCrawlDetailById(ctx.params.crawlId!, url.id)
    if (!crawl) return ctx.throw(404, 'Crawl not found')
    ctx.json(
      apiResponse('GET:/api/v1/urls/:id/crawls/:crawlId#paid', {
        crawl,
      }),
    )
    return
  }

  const crawl = await getCrawlById(ctx.params.crawlId!, url.id)
  if (!crawl) return ctx.throw(404, 'Crawl not found')

  const og_image_sideload = buildFirstSideloadImageUrl([
    crawl.embed_metadata?.thumbnail?.url,
    crawl.meta_tags?.['og:image'],
    crawl.meta_tags?.['twitter:image'],
  ])

  ctx.json(
    apiResponse('GET:/api/v1/urls/:id/crawls/:crawlId#privileged', {
      crawl,
      og_image_sideload,
    }),
  )
})

function buildFirstSideloadImageUrl(imageUrls: unknown[]): string | null {
  for (const imageUrl of imageUrls) {
    if (typeof imageUrl !== 'string') continue
    const sideloadUrl = buildSideloadImageUrl(imageUrl, {
      imageOrigin: getImageOrigin(),
      width: 400,
      signingKeys: getSigningKeys(),
    })
    if (sideloadUrl) return sideloadUrl
  }
  return null
}
