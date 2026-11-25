import { parseStripeEventBridgeEvent } from '@vouchington/stripe'
import type { SqsMessage } from '@vouchington/worker-runtime/sqs'
import { ingestStripeEvent } from '@services/stripe/events'

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
  await ingestStripeEvent(parseStripeEventBridgeEvent(message.body))
}
