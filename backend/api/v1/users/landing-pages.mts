import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getPublicLandingPage } from '@services/my'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

app.route('/api/v1/users/:username/landing-page').get(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('GET:/api/v1/users/:username/landing-page')
  const landingPage = await getPublicLandingPage(ctx.params.username!)
  ctx.assert(landingPage, 404, 'Landing page not found')
  ctx.cacheControl('public', HTTP_CACHE_LONG_MAX_AGE_SECONDS)
  ctx.json(landingPage)
})

app.route('/api/v1/users/:username/landing-pages/:slug').get(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('GET:/api/v1/users/:username/landing-pages/:slug')
  const landingPage = await getPublicLandingPage(ctx.params.username!, ctx.params.slug!)
  ctx.assert(landingPage, 404, 'Landing page not found')
  ctx.cacheControl('public', HTTP_CACHE_LONG_MAX_AGE_SECONDS)
  ctx.json(landingPage)
})
