import app from '../../app.mts'

/**
 * GET /api/v1/auth/me
 * Returns the current user's information based on session cookie
 */
app.route('/api/v1/auth/me').get(async ctx => {
  const currentUser = await ctx.getCurrentUser()
  await ctx.applyRouteRateLimit('GET:/api/v1/auth/me')

  if (!currentUser) {
    ctx.setStatus(401)
    ctx.json({ error: 'Unauthorized' })
    return
  }

  ctx.json({ user: currentUser })
})
