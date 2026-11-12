import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  areHackerNewsReferencesVisible,
  getHackerNewsPostTimeRangeCap,
} from '@services/urls/hacker-news-visibility-config'

app.route('/api/v1/hacker-news-config').get((ctx: Context) => {
  ctx.set('Cache-Control', 'private, no-store')
  ctx.json({
    references_visible: areHackerNewsReferencesVisible(),
    post_time_range_cap: getHackerNewsPostTimeRangeCap(),
  })
})
