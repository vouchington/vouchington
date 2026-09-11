import { Agent } from 'node:https'
import pMap from 'p-map'
import webpush from 'web-push'
import type { NotificationPushDeliveryPolicy } from './push-intent-delivery-policy.mts'
import { createNotificationPushIntentLeaseKeeper } from './push-intent-lease-keeper.mts'
import {
  persistClaimedNotificationPushOutcome,
  type NotificationPushEndpointOutcome,
  type PushSubscriptionRow,
} from './push-intent-results.mts'
import { renewNotificationPushIntentLease, type NotificationPushIntent } from './push-intents.mts'
import { buildNotificationPushPayload, type PushPayloadNotification } from './push-payload.mts'

export type PushDeliveryRun = {
  outcomes: NotificationPushEndpointOutcome[]
  subscriptionStale: boolean
  ownershipLost: boolean
  fatalError: Error | undefined
}

export type PushDeliveryDependencies = {
  createAgent?: () => Agent
  renew?: typeof renewNotificationPushIntentLease
  persist?: typeof persistClaimedNotificationPushOutcome
}

export async function runNotificationPushDelivery(input: {
  intent: NotificationPushIntent
  pending: PushSubscriptionRow[]
  notification: PushPayloadNotification
  policy: NotificationPushDeliveryPolicy
  dependencies?: PushDeliveryDependencies
}): Promise<PushDeliveryRun> {
  const agent = input.dependencies?.createAgent?.() ?? new Agent({ keepAlive: true })
  const outcomes: NotificationPushEndpointOutcome[] = []
  let subscriptionStale = false
  const keeper = createNotificationPushIntentLeaseKeeper({
    intent: input.intent,
    leaseSeconds: input.policy.leaseSeconds,
    renewalMs: input.policy.renewalMs,
    renew: input.dependencies?.renew ?? renewNotificationPushIntentLease,
    onLost: () => agent.destroy(),
  })
  try {
    await keeper.renewNow()
    if (keeper.ownershipLost) {
      await keeper.stopAndSettle()
      return { outcomes, subscriptionStale, ownershipLost: true, fatalError: keeper.fatalError }
    }
    keeper.start()
    await pMap(
      input.pending,
      async subscription => {
        if (keeper.ownershipLost) return
        const outcome = await sendSubscription(
          subscription,
          buildNotificationPushPayload(input.notification, subscription),
          agent,
          input.policy,
        )
        if (!keeper.ownershipLost) {
          try {
            const persist = input.dependencies?.persist ?? persistClaimedNotificationPushOutcome
            const persistence = await persist(input.intent, outcome)
            if (persistence === 'lease_lost') {
              keeper.fail()
              return
            }
            if (persistence === 'subscription_stale') {
              subscriptionStale = true
              return
            }
            if (persistence === 'persisted') outcomes.push(outcome)
          } catch (error) {
            keeper.fail(
              error instanceof Error ? error : new Error('Push outcome persistence failed'),
            )
          }
        }
      },
      { concurrency: input.policy.endpointConcurrency, stopOnError: false },
    )
    await keeper.stopAndSettle()
    if (!keeper.ownershipLost) await keeper.renewNow()
    await keeper.stopAndSettle()
    return {
      outcomes,
      subscriptionStale,
      ownershipLost: keeper.ownershipLost,
      fatalError: keeper.fatalError,
    }
  } finally {
    agent.destroy()
  }
}

async function sendSubscription(
  subscription: PushSubscriptionRow,
  payload: string,
  agent: Agent,
  policy: NotificationPushDeliveryPolicy,
): Promise<NotificationPushEndpointOutcome> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
      { agent, timeout: policy.socketTimeoutMs },
    )
    return { kind: 'delivered', subscription }
  } catch (error) {
    return { kind: getFailureKind(error), subscription }
  }
}

function getFailureKind(
  error: unknown,
): Exclude<NotificationPushEndpointOutcome['kind'], 'delivered'> {
  const statusCode =
    typeof error === 'object' && error && 'statusCode' in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined
  if (typeof statusCode !== 'number' || !Number.isInteger(statusCode)) return 'retryable_failure'
  if (statusCode === 404 || statusCode === 410) return 'subscription_invalid'
  if (statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode <= 599)) {
    return 'retryable_failure'
  }
  return statusCode >= 300 && statusCode <= 499
    ? 'notification_terminal_failure'
    : 'retryable_failure'
}
