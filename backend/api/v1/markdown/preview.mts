import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import renderMarkdown from '@services/markdown'
import { parseJsonBody, requireAuth } from '../../response-helpers.mts'

/**
 * POST /api/v1/markdown/preview
 *
 * Renders markdown to HTML using the same pipeline as post/comment rendering.
 *
 * Always renders in non-admin mode — admin raw HTML is intentionally excluded from previews.
 * Admins will see a slightly different output compared to their final published post; this is an
 * acceptable trade-off to keep the endpoint simple and safe. An admin-mode preview can be added
 * as a follow-up if needed.
 *
 * Auth: required
 * Rate limit: per-user default
 */
app.route('/api/v1/markdown/preview').post(async (ctx: Context) => {
  await requireAuth(ctx, 'POST:/api/v1/markdown/preview')

  const body = await parseJsonBody<{ markdown?: unknown }>(ctx, '32kb')
  const markdown = typeof body.markdown === 'string' ? body.markdown : ''

  const html = await renderMarkdown(markdown, {
    allowHtml: false,
    nofollowLinks: true,
    proxyImages: true,
  })

  ctx.json({ html })
})
