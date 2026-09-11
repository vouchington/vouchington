import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { requireAuth, parseJsonBody } from '../../response-helpers.mts'
import { getEmailPreferences, updateEmailPreferences, type EmailPreferences } from '@services/users'

// GET /api/v1/my/email-preferences
app.route('/api/v1/my/email-preferences').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/email-preferences')
  const email_preferences = await getEmailPreferences(currentUser.id)
  ctx.json({ email_preferences })
})

// PATCH /api/v1/my/email-preferences
app.route('/api/v1/my/email-preferences').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/email-preferences')
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const email_preferences = await updateEmailPreferences(
    currentUser.id,
    body as Partial<EmailPreferences>,
  )
  ctx.json({ email_preferences })
})
