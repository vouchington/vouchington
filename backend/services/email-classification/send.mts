import { sendEmail } from '@modules/aws/ses'
import { sendGmailEmail } from '@modules/gmail-smtp'
import { wasCrmContactEmailOptedOut } from '@services/crm-contacts'
import { isEmailSuppressed } from '@services/ses-bounce-events'
import { getEmailPreferences, type EmailPreferences } from '@services/users'
import { EMAIL_CLASSIFICATIONS, type EmailType } from './registry.mts'
import { buildClassifiedSendParams } from './send-params.mts'

export type SendClassifiedEmailOptions = {
  to: string
  subject: string
  html?: string
  text?: string
  userId?: string
  crmEmail?: string
  provider?: 'ses' | 'gmail_smtp'
  source?: string
  replyToAddress?: string
  allowGlobalBcc?: boolean
}

export async function sendClassifiedEmail(
  type: EmailType,
  options: SendClassifiedEmailOptions,
): Promise<unknown> {
  const entry = EMAIL_CLASSIFICATIONS[type]

  if (entry.classification === 'marketing') {
    if (entry.unsubscribe.scheme === 'user-category' && options.userId) {
      const prefs = await getEmailPreferences(options.userId)
      if (isUnsubscribedFromCategory(prefs, entry.unsubscribe.category)) return null
    }

    if (entry.unsubscribe.scheme === 'crm-contact') {
      if (await wasCrmContactEmailOptedOut(options.crmEmail || options.to)) return null
    }

    if (await isEmailSuppressed(options.to)) return null
  }

  const params = buildClassifiedSendParams(type, {
    userId: options.userId,
    crmEmail: options.crmEmail || options.to,
  })

  if (options.provider === 'gmail_smtp') {
    return sendGmailEmail({
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      headers: params.headers,
    })
  }

  return sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    headers: params.headers,
    configurationSetName: params.configurationSetName,
    source: options.source,
    replyToAddress: options.replyToAddress,
    allowGlobalBcc: options.allowGlobalBcc,
  })
}

function isUnsubscribedFromCategory(
  prefs: EmailPreferences,
  category: 'outcome_emails' | 'news_digest' | 'community_digest',
): boolean {
  if (category === 'outcome_emails') return !prefs.engagement_emails_enabled
  if (category === 'news_digest') return prefs.news_digest_frequency === 'none'
  return !prefs.moderation_emails_enabled || prefs.community_digest_frequency === 'none'
}
