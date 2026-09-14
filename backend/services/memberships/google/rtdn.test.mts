import { describe, expect, it } from 'vitest'
import { parseGooglePlayRtdn } from './rtdn.mts'

const packageName = 'ai.voucha.android'

function push(notification: Record<string, unknown>, messageId = 'synthetic-message'): Buffer {
  return Buffer.from(
    JSON.stringify({
      message: {
        messageId,
        data: Buffer.from(JSON.stringify({ packageName, ...notification })).toString('base64'),
      },
    }),
  )
}

describe('Google Play RTDN envelope', () => {
  it('accepts subscriptions and voided purchases as authoritative fetch triggers', () => {
    expect(
      parseGooglePlayRtdn(
        push({
          eventTimeMillis: '1789084800000',
          subscriptionNotification: {
            purchaseToken: 'synthetic-token',
            subscriptionId: 'plus.monthly',
            notificationType: 2,
          },
        }),
        packageName,
      ),
    ).toMatchObject({ purchaseToken: 'synthetic-token', subscriptionId: 'plus.monthly' })
    expect(
      parseGooglePlayRtdn(
        push({ voidedPurchaseNotification: { purchaseToken: 'voided-token', productType: 1 } }),
        packageName,
      ),
    ).toEqual({ kind: 'voided', messageId: 'synthetic-message', purchaseToken: 'voided-token' })
  })

  it('ignores valid test and one-time-product variants without retrying them', () => {
    for (const notification of [
      { testNotification: { version: '1.0' } },
      { oneTimeProductNotification: { purchaseToken: 'other-product' } },
      { voidedPurchaseNotification: { purchaseToken: 'other-product', productType: 2 } },
    ])
      expect(parseGooglePlayRtdn(push(notification), packageName)).toEqual({
        kind: 'ignored',
        messageId: 'synthetic-message',
      })
  })

  it('rejects malformed, wrong-package, and oversized envelopes', () => {
    expect(parseGooglePlayRtdn(Buffer.from('{'), packageName)).toBeNull()
    expect(parseGooglePlayRtdn(push({ testNotification: {} }), 'different.package')).toBeNull()
    expect(parseGooglePlayRtdn(Buffer.alloc(32_769), packageName)).toBeNull()
    for (const messageId of ['', ' ', ' leading', 'trailing ', 'x'.repeat(256)])
      expect(parseGooglePlayRtdn(push({ testNotification: {} }, messageId), packageName)).toBeNull()
    expect(
      parseGooglePlayRtdn(
        Buffer.from(JSON.stringify({ message: { messageId: 'id', data: 42 } })),
        packageName,
      ),
    ).toBeNull()
    expect(
      parseGooglePlayRtdn(
        Buffer.from(JSON.stringify({ message: { messageId: 'id', data: 'bm90LWpzb24=' } })),
        packageName,
      ),
    ).toBeNull()
    expect(
      parseGooglePlayRtdn(
        push({ eventTimeMillis: 'invalid', subscriptionNotification: { purchaseToken: 'token' } }),
        packageName,
      ),
    ).toBeNull()
    expect(
      parseGooglePlayRtdn(
        push({ voidedPurchaseNotification: { purchaseToken: 'token' } }),
        packageName,
      ),
    ).toBeNull()
  })
})
