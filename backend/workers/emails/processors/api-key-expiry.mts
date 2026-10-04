import { getApiKeyExpiryLimits } from '@services/api-keys/work-limits'
import {
  getApiKeysDueForExpiryReminder,
  getApiKeyExpiryReminderDetails,
  claimApiKeyExpiryReminder,
} from '@services/api-keys/expiry-reminders'
import {
  enqueueBulkSendApiKeyExpiryReminders,
  enqueueDispatchApiKeyExpiryReminders,
} from '@queues/emails/enqueues/api-key-expiry'
import { getVerifiedEmailAddress } from '@services/contribution-gating'
import { getPrivateUserByAny } from '@services/users'
import { renderApiKeyExpiryEmail } from '@email-templates/core'
import { getSiteUrl } from '@modules/utils'
import { sendClassifiedEmail } from '@services/email-classification'

export async function dispatchApiKeyExpiryReminders(
  data: { afterId?: string } = {},
): Promise<{ hasMore: boolean }> {
  const { batchSize, maxBatches } = getApiKeyExpiryLimits()
  let afterId = data.afterId
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- Advance the cursor only after this bounded page is queued.
    const ids = await getApiKeysDueForExpiryReminder(afterId, batchSize)
    // oxlint-disable-next-line no-await-in-loop -- Await each bounded bulk enqueue before scanning the next page.
    await enqueueBulkSendApiKeyExpiryReminders(ids)
    if (ids.length < batchSize) return { hasMore: false }
    afterId = ids.at(-1)
  }
  await enqueueDispatchApiKeyExpiryReminders({ afterId })
  return { hasMore: true }
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
