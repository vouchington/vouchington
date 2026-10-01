import {
  getApiKeysDueForExpiryReminder,
  getApiKeyExpiryReminderDetails,
  claimApiKeyExpiryReminder,
} from '@services/api-keys/expiry-reminders'
import { enqueueBulkSendApiKeyExpiryReminders } from '@queues/emails/enqueues/api-key-expiry'
import { getVerifiedEmailAddress } from '@services/contribution-gating'
import { getPrivateUserByAny } from '@services/users'
import { renderApiKeyExpiryEmail } from '@email-templates/core'
import { getSiteUrl } from '@modules/utils'
import { sendClassifiedEmail } from '@services/email-classification'

export async function dispatchApiKeyExpiryReminders(): Promise<void> {
  let afterId: string | undefined
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- Advance the cursor only after this bounded page is queued.
    const ids = await getApiKeysDueForExpiryReminder(afterId)
    // oxlint-disable-next-line no-await-in-loop -- Await each bounded bulk enqueue before scanning the next page.
    await enqueueBulkSendApiKeyExpiryReminders(ids)
    if (ids.length < 100) return
    afterId = ids.at(-1)
  }
}

export async function processSendApiKeyExpiryReminder(apiKeyId: string): Promise<unknown> {
  const details = await getApiKeyExpiryReminderDetails(apiKeyId)
  if (!details) return null
  const [user, emailAddress] = await Promise.all([
    getPrivateUserByAny(details.user_id),
    getVerifiedEmailAddress(details.user_id),
  ])
  if (!user || !emailAddress) return null
  const email = await renderApiKeyExpiryEmail({
    label: details.label,
    expiresAt: details.expires_at.toISOString(),
    apiKeysUrl: getSiteUrl('/my/api-keys'),
    uiLocale: user.ui_locale,
  })
  if (!(await claimApiKeyExpiryReminder(apiKeyId))) return null
  return sendClassifiedEmail('processSendApiKeyExpiryReminder', {
    to: emailAddress,
    userId: user.id,
    ...email,
  })
}
