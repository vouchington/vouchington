import type { GooglePlayRtdn } from './types.mts'

const MAX_PUSH_BYTES = 32_768

export type GooglePlayRtdnParseResult =
  | GooglePlayRtdn
  | { kind: 'ignored'; messageId: string }
  | { kind: 'voided'; messageId: string; purchaseToken: string }
export function parseGooglePlayRtdn(
  rawBody: Buffer,
  expectedPackageName: string,
): GooglePlayRtdnParseResult | null {
  if (rawBody.byteLength > MAX_PUSH_BYTES) return null
  let envelope: unknown
  try {
    envelope = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return null
  }
  if (
    !isRecord(envelope) ||
    !isRecord(envelope.message) ||
    typeof envelope.message.messageId !== 'string' ||
    typeof envelope.message.data !== 'string'
  )
    return null
  const messageId = envelope.message.messageId
  if (
    !messageId.trim() ||
    messageId !== messageId.trim() ||
    Buffer.byteLength(messageId, 'utf8') > 255
  )
    return null
  let notification: unknown
  try {
    notification = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8'))
  } catch {
    return null
  }
  if (!isRecord(notification) || notification.packageName !== expectedPackageName) return null
  if (isRecord(notification.testNotification) || isRecord(notification.oneTimeProductNotification))
    return { kind: 'ignored', messageId }
  if (isRecord(notification.voidedPurchaseNotification)) {
    if (notification.voidedPurchaseNotification.productType === 2)
      return { kind: 'ignored', messageId }
    if (notification.voidedPurchaseNotification.productType !== 1) return null
    const purchaseToken = notification.voidedPurchaseNotification.purchaseToken
    return typeof purchaseToken === 'string' && purchaseToken.trim()
      ? { kind: 'voided', messageId, purchaseToken }
      : null
  }
  if (!isRecord(notification.subscriptionNotification)) return null
  const details = notification.subscriptionNotification
  const eventTime =
    typeof notification.eventTimeMillis === 'string'
      ? new Date(Number(notification.eventTimeMillis))
      : null
  if (
    !eventTime ||
    Number.isNaN(eventTime.getTime()) ||
    typeof details.purchaseToken !== 'string' ||
    !details.purchaseToken.trim() ||
    typeof details.subscriptionId !== 'string' ||
    !details.subscriptionId.trim() ||
    typeof details.notificationType !== 'number'
  )
    return null
  return {
    messageId,
    packageName: notification.packageName,
    purchaseToken: details.purchaseToken,
    subscriptionId: details.subscriptionId,
    eventTime,
    notificationType: details.notificationType,
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
