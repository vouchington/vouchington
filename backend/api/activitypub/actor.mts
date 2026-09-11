import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { setAnonymousPublicCacheHeaders, validateUUIDParam } from '../response-helpers.mts'
import {
  getPublicUserByIdOrSlug,
  getUserDisplayName,
  isFederationEnabledForUser,
} from '@services/users'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import {
  AP_CONTEXT,
  getActorFollowersUri,
  getActorFollowingUri,
  getActorKeyId,
  getActorOutboxUri,
  getActorUri,
  getSharedInboxUri,
} from '@modules/activitypub-uris'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

// Actor documents are fetched anonymously by remote fediverse servers — no Voucha session
// applies, so this route intentionally skips response-helpers.mts's session-auth preamble.
// Actor identity is UUID-only (`/ap/users/:userId`); `username` never appears here — see
// webfinger.mts, the one place it is allowed to appear, as the `acct:` alias.
app.route('/ap/users/:userId').get(async (ctx: Context) => {
  const userId = validateUUIDParam(ctx, 'userId')

  const user = await getPublicUserByIdOrSlug(userId)
  ctx.assert(user, 404, 'Not Found')
  ctx.assert(await isFederationEnabledForUser(userId), 404, 'Not Found')

  const keyPair = await getOrCreateActorKeyPair(userId)
  const actorUri = getActorUri(userId)

  setAnonymousPublicCacheHeaders(ctx, null, HTTP_CACHE_LONG_MAX_AGE_SECONDS)
  ctx.response.buffer(
    Buffer.from(
      JSON.stringify({
        '@context': AP_CONTEXT,
        id: actorUri,
        type: 'Person',
        name: getUserDisplayName(user),
        // Shared inbox is the only inbox this app implements (Phase C2) — outbox/followers/
        // following are advertised per the Person vocabulary's required shape, but the
        // corresponding collection endpoints are not yet built (Phase C4+).
        inbox: getSharedInboxUri(),
        outbox: getActorOutboxUri(userId),
        followers: getActorFollowersUri(userId),
        following: getActorFollowingUri(userId),
        endpoints: { sharedInbox: getSharedInboxUri() },
        publicKey: {
          id: getActorKeyId(userId),
          owner: actorUri,
          publicKeyPem: keyPair.public_key_pem,
        },
      }),
    ),
    'application/activity+json',
  )
})
