import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getFeatureFlags,
  getFeatureFlagsWithOverrides,
  parseFeatureFlagCookie,
} from '@services/feature-flags'

// GET /api/v1/feature-flags - Get public feature flags with optional cookie overrides
app.route('/api/v1/feature-flags').get(async (ctx: Context) => {
  const ffCookie = ctx.cookies.get('ff')
  const overrides = ffCookie ? parseFeatureFlagCookie(ffCookie) : {}
  const flags =
    Object.keys(overrides).length > 0 ? getFeatureFlagsWithOverrides(overrides) : getFeatureFlags()

  ctx.json({ flags, overrides })
})
