import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { assertOpenAiSpendCapNotBreached } from '@services/ai-usage'
import {
  currentUserCanManageCrm,
  getCrmContact,
  getCrmContactSocialAccounts,
} from '@services/crm-contacts'
import { draftCrmOutreachEmail } from '@agents/crm-outreach'
import {
  requireAuthAndRateLimit,
  validateUUIDParam,
  parseJsonBody,
} from '../../../response-helpers.mts'

/**
 * POST /api/v1/crm/contacts/:contactId/email-drafts — Generate an AI email draft for a contact.
 * Body: { prompt?: string, tone?: string }
 */
app.route('/api/v1/crm/contacts/:contactId/email-drafts').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'POST:/api/v1/crm/contacts/:contactId/email-drafts',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')
  const body = await parseJsonBody<{ prompt?: unknown; tone?: unknown }>(ctx)

  const [contact, socialAccounts] = await Promise.all([
    getCrmContact(contactId),
    getCrmContactSocialAccounts(contactId),
  ])
  ctx.assert(contact, 404, 'Contact not found')

  const spendCapBreach = await assertOpenAiSpendCapNotBreached('crm-outreach-email-draft')
  ctx.assert(!spendCapBreach, 429, 'Daily OpenAI spend cap reached, try again after UTC midnight')

  const draft = await draftCrmOutreachEmail(currentUser, contact!, {
    prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
    tone: typeof body.tone === 'string' ? body.tone : undefined,
    socialAccounts,
  })

  ctx.json({ draft })
})
