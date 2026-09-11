import type { SqsMessage } from '@backend/worker-runtime'
import { ingestStripeEvent } from '@services/stripe/events'

type StripeEvent = Parameters<typeof ingestStripeEvent>[0]

interface EventBridgeEnvelope {
  detail?: unknown
}

// EventBridge-to-SQS delivery has no raw-message-delivery equivalent (unlike the SNS subscription
// ses-bounce-sqs reads): the queue body is always the full PutEvents envelope
// ({version, id, detail-type, source, account, time, region, resources, detail}), so the actual
// Stripe.Event always lives at `.detail` -- see vouchington-infra/opentofu/sqs-event-ingress.tf and
// docs/overview/architecture/event-ingress.md. This consumer trusts EventBridge partner-source
// delivery as the authenticity guarantee (only Stripe's verified EventBridge destination can put
// events onto the partner event bus that feeds this queue) and does not verify an HMAC
// signature -- there is no Stripe-Signature header on an EventBridge delivery to check. A
// malformed or non-enveloped message throws rather than being swallowed, so SQS
// redelivery/maxReceiveCount routes it to the DLQ instead of silently dropping it.
export async function processStripeEventsSqsMessage(message: SqsMessage): Promise<void> {
  let envelope: EventBridgeEnvelope | null
  try {
    envelope = JSON.parse(message.body) as EventBridgeEnvelope | null
  } catch (error) {
    if (error instanceof SyntaxError) {
      error.message = `stripe-events-sqs: invalid JSON body: ${error.message}`
    }
    throw error
  }

  const detail = envelope?.detail
  if (detail == null || typeof detail !== 'object' || Array.isArray(detail)) {
    throw new Error('EventBridge envelope missing detail')
  }
  const detailRecord = detail as Record<string, unknown>
  if (typeof detailRecord.id !== 'string' || typeof detailRecord.type !== 'string') {
    throw new Error('EventBridge envelope detail is not a Stripe event')
  }

  await ingestStripeEvent(detail as StripeEvent)
}
