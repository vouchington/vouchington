import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { setAnonymousPublicCacheHeaders } from '../response-helpers.mts'
import { getTotalUserCount } from '@services/users'
import { getSiteUrl } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

// Mirrors the schema this same codebase already reads from remote instances — see
// backend/services/fediverse-search/adapters/instance-classification-mappers.mts, the Phase B
// inbound NodeInfo reader. No dedicated app-version constant exists yet; this is a
// federation-facing disclosure value, not a build/release identifier.
const NODEINFO_SCHEMA_2_0_REL = 'http://nodeinfo.diaspora.software/ns/schema/2.0'
const NODEINFO_SOFTWARE_NAME = 'voucha'
const NODEINFO_SOFTWARE_VERSION = '1.0.0'

// Discovery + NodeInfo are fetched anonymously by remote fediverse servers (and by this app's own
// Phase B classifier when reading *other* instances) — no Voucha session applies, so both routes
// intentionally skip response-helpers.mts's session-auth preamble.
app.route('/.well-known/nodeinfo').get((ctx: Context) => {
  setAnonymousPublicCacheHeaders(ctx, null, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
  ctx.response.buffer(
    Buffer.from(
      JSON.stringify({
        links: [{ rel: NODEINFO_SCHEMA_2_0_REL, href: getSiteUrl('/nodeinfo/2.0') }],
      }),
    ),
    'application/json',
  )
})

app.route('/nodeinfo/2.0').get(async (ctx: Context) => {
  const totalUsers = await getTotalUserCount()

  setAnonymousPublicCacheHeaders(ctx, null, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
  ctx.response.buffer(
    Buffer.from(
      JSON.stringify({
        version: '2.0',
        software: { name: NODEINFO_SOFTWARE_NAME, version: NODEINFO_SOFTWARE_VERSION },
        protocols: ['activitypub'],
        services: { inbound: [], outbound: [] },
        openRegistrations: true,
        usage: { users: { total: totalUsers } },
        metadata: {},
      }),
    ),
    'application/json',
  )
})
