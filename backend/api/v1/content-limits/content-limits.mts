import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { getCopyrightClaimantTargetsMax } from '@services/copyright-notices/config'
import { getPostContentLimitsConfig } from '@services/post-content-limits'

type ContentLimitsResponse = {
  post_images_max: number
  copyright_claimant_targets_max: number
}

app.route('/api/v1/content-limits').get((ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const body: ContentLimitsResponse = {
    post_images_max: getPostContentLimitsConfig().post_images_max,
    copyright_claimant_targets_max: getCopyrightClaimantTargetsMax(),
  }
  ctx.json(body)
})
