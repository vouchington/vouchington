import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { setAnonymousPublicCacheHeaders } from '../response-helpers.mts'
import { getPublicUserByIdOrSlug, isFederationEnabledForUser } from '@services/users'
import { getActorUri, getWebfingerAcct, parseWebfingerAcct } from '@modules/activitypub-uris'
import { getSiteOrigin } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

// WebFinger is fetched anonymously by remote fediverse servers resolving an `acct:` handle — there
// is no Voucha session to authenticate, so this route intentionally skips response-helpers.mts's
// session-auth preamble (requireAuth / getOptionalAuthAndRateLimit) rather than hand-rolling it.
app.route('/.well-known/webfinger').get(async (ctx: Context) => {
  const resource = firstQueryValue(ctx.query.resource)
  ctx.assert(resource, 400, 'resource query parameter is required')

  const parsed = parseWebfingerAcct(resource)
  ctx.assert(parsed, 400, 'resource must be an acct: URI')

  const ourHostname = new URL(getSiteOrigin()).hostname
  ctx.assert(parsed.hostname === ourHostname, 404, 'Not Found')

  const user = await getPublicUserByIdOrSlug(parsed.username)
  ctx.assert(user, 404, 'Not Found')
  ctx.assert(await isFederationEnabledForUser(user.id), 404, 'Not Found')

  const actorUri = getActorUri(user.id)
  setAnonymousPublicCacheHeaders(ctx, null, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
  ctx.response.buffer(
    Buffer.from(
      JSON.stringify({
        subject: getWebfingerAcct(parsed.username),
        aliases: [actorUri],
        links: [{ rel: 'self', type: 'application/activity+json', href: actorUri }],
      }),
    ),
    'application/jrd+json',
  )
})

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
