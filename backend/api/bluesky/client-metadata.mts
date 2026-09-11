import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { setAnonymousPublicCacheHeaders } from '../response-helpers.mts'
import { getBlueskyClientMetadata } from '@modules/bluesky-oauth'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

// Fetched anonymously by Bluesky's (or any AT Protocol) authorization server when validating this
// app's OAuth client_id — the client_id *is* this URL (see getBlueskyClientId in
// @modules/bluesky-oauth/client-metadata.mts). No Voucha session applies, so this route
// intentionally skips response-helpers.mts's session-auth preamble, mirroring
// backend/api/activitypub/webfinger.mts and nodeinfo.mts.
app.route('/client-metadata.json').get(async (ctx: Context) => {
  setAnonymousPublicCacheHeaders(ctx, null, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
  const metadata = await getBlueskyClientMetadata()
  ctx.response.buffer(Buffer.from(JSON.stringify(metadata)), 'application/json')
})
