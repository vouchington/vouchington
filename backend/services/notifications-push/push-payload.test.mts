import { describe, expect, it } from 'vitest'
import { buildNotificationPushPayload } from './push-payload.mts'

describe('buildNotificationPushPayload', () => {
  it('includes the exact endpoint and activation generation', () => {
    const endpoint = 'https://push.example.test/subscription'
    const subscriptionId = crypto.randomUUID()
    const payload = buildNotificationPushPayload(
      {
        id: crypto.randomUUID(),
        entity_type: 'follow',
        title: 'A notification',
        body: 'Body',
        target_path: '/',
        target_entity: null,
        target_intent: null,
        community_slug: null,
      },
      { endpoint, id: subscriptionId },
    )

    expect(JSON.parse(payload)).toMatchObject({
      web_push_endpoint: endpoint,
      web_push_subscription_id: subscriptionId,
    })
  })

  it('uses the neutral fallback URL for unsupported structured targets', () => {
    const payload = buildNotificationPushPayload(
      {
        id: crypto.randomUUID(),
        entity_type: 'follow',
        title: 'A notification',
        body: 'Body',
        target_path: '/ignored-by-structured-target',
        target_entity: { __entity_type: 'unrecognized', id: crypto.randomUUID() },
        target_intent: 'unrecognized_intent',
        community_slug: null,
      },
      { endpoint: 'https://push.example.test/subscription', id: crypto.randomUUID() },
    )

    expect(JSON.parse(payload)).toMatchObject({
      target_intent: 'unrecognized_intent',
      url: '/',
    })
  })
})
