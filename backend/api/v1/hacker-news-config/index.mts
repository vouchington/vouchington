import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { setPublicCacheHeaders, setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  areHackerNewsReferencesVisible,
  getHackerNewsPostTimeRangeCap,
} from '@services/urls/hacker-news-visibility-config'

app.route('/api/v1/hacker-news-config').get(async (ctx: Context) => {
  // Bootstrap clients fetch this without attestation; auth only selects the cache audience.
  const currentUser = await ctx.getCurrentUser()
  if (currentUser) setPrivateNoStoreCacheHeaders(ctx)
  else setPublicCacheHeaders(ctx)
  ctx.json({
    references_visible: areHackerNewsReferencesVisible(),
    post_time_range_cap: getHackerNewsPostTimeRangeCap(),
  })
})
