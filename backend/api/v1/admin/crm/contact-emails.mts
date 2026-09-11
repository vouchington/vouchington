import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { currentUserCanManageCrm } from '@services/crm-contacts'
import { getCrmMessagesByContactId, sendCrmEmail } from '@services/crm-messages'
import {
  requireAuthAndRateLimit,
  validateUUIDParam,
  parseJsonBody,
} from '../../../response-helpers.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

/**
 * GET /api/v1/crm/contacts/:contactId/emails — List email messages for a contact.
 */
app.route('/api/v1/crm/contacts/:contactId/emails').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'GET:/api/v1/crm/contacts/:contactId/emails',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')

  const { limit, after } = parser.parse(ctx.query)

  const { results, page_info } = await getCrmMessagesByContactId(contactId, { limit, after })

  ctx.json({ results, page_info })
})

type SendEmailBody = {
  subject?: unknown
  body_html?: unknown
  body_text?: unknown
  email_provider?: unknown
  cta_url?: unknown
  ai_prompt?: unknown
  ai_generated_at?: unknown
}

/**
 * POST /api/v1/crm/contacts/:contactId/emails — Send an outreach email to a contact.
 */
app.route('/api/v1/crm/contacts/:contactId/emails').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'POST:/api/v1/crm/contacts/:contactId/emails',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')
  const body = await parseJsonBody<SendEmailBody>(ctx)

  ctx.assert(typeof body.subject === 'string' && body.subject.trim(), 422, 'subject is required')
  ctx.assert(
    typeof body.body_html === 'string' || typeof body.body_text === 'string',
    422,
    'body_html or body_text is required',
  )
  ctx.assert(
    body.email_provider === 'ses' || body.email_provider === 'gmail_smtp',
    422,
    "email_provider must be 'ses' or 'gmail_smtp'",
  )

  const aiGeneratedAt =
    typeof body.ai_generated_at === 'string' ? new Date(body.ai_generated_at) : null
  ctx.assert(
    aiGeneratedAt == null || !Number.isNaN(aiGeneratedAt.getTime()),
    422,
    'Invalid ai_generated_at; expected ISO timestamp string',
  )

  const message = await sendCrmEmail(currentUser, contactId, {
    subject: (body.subject as string).trim(),
    body_html: typeof body.body_html === 'string' ? body.body_html : null,
    body_text: typeof body.body_text === 'string' ? body.body_text : null,
    email_provider: body.email_provider as 'ses' | 'gmail_smtp',
    cta_url: typeof body.cta_url === 'string' ? body.cta_url : null,
    ai_prompt: typeof body.ai_prompt === 'string' ? body.ai_prompt : null,
    ai_generated_at: aiGeneratedAt,
  })

  ctx.setStatus(201)
  ctx.json({ message })
})
