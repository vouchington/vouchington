import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  areHackerNewsReferencesVisible,
  getHackerNewsPostTimeRangeCap,
  type HackerNewsPostTimeRange,
} from '@services/urls/hacker-news-visibility-config'

type HackerNewsConfigResponse = {
  references_visible: boolean
  post_time_range_cap: HackerNewsPostTimeRange
}

app.route('/api/v1/hacker-news-config').get((ctx: Context) => {
  ctx.set('Cache-Control', 'private, no-store')
  const body: HackerNewsConfigResponse = {
    references_visible: areHackerNewsReferencesVisible(),
    post_time_range_cap: getHackerNewsPostTimeRangeCap(),
  }
  ctx.json(body)
})
