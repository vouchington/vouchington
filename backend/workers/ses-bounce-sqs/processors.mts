import assert from 'http-assert'
import type { SqsMessage } from '@backend/worker-runtime'
import { createSesBounceEvent, type CreateSesBounceEventInput } from '@services/ses-bounce-events'
import {
  markCopyrightDeliveryIntentBouncedBySesMessageId,
  markCopyrightEmailIntakeResponseBouncedBySesMessageId,
} from '@services/copyright-notices'

interface SesRecipient {
  emailAddress: string
  diagnosticCode?: string
}

interface SesBounce {
  bounceType?: string
  bounceSubType?: string
  bouncedRecipients?: SesRecipient[]
  timestamp?: string
  feedbackId?: string
  reportingMTA?: string
}

interface SesComplaint {
  complainedRecipients?: SesRecipient[]
  timestamp?: string
  feedbackId?: string
}

interface SesDelivery {
  recipients?: string[]
  timestamp?: string
  reportingMTA?: string
}

interface SesMail {
  messageId?: string
  timestamp?: string
}

interface SesNotification {
  eventType?: string
  notificationType?: string
  mail?: SesMail
  bounce?: SesBounce
  complaint?: SesComplaint
  delivery?: SesDelivery
}

// SNS raw_message_delivery = true (vouchington-infra/opentofu/ses.tf: aws_sns_topic_subscription.ses_bounce_sqs)
// strips the SNS envelope, so the queue body is the bare SES notification JSON. The topic is fed
// exclusively by aws_sesv2_configuration_set_event_destination (vouchington-infra/opentofu/ses.tf), and per AWS's
// event-publishing docs the top-level type discriminator for that mechanism is `eventType` --
// `notificationType` only appears when event publishing was NOT configured for the identity. Fall
// back to `notificationType` for defense-in-depth in case a message ever arrives via that legacy
// path. A malformed or unrecognized message throws (via http-assert) rather than being swallowed,
// so SQS redelivery/maxReceiveCount routes it to the DLQ instead of silently dropping it.
export async function processSesBounceSqsMessage(message: SqsMessage): Promise<void> {
  const notification = JSON.parse(message.body) as SesNotification
  const input = buildCreateSesBounceEventInput(notification)
  await createSesBounceEvent(input)
  if (isTerminalCopyrightDeliveryFailure(input) && input.ses_message_id) {
    await markCopyrightDeliveryIntentBouncedBySesMessageId({
      sesMessageId: input.ses_message_id,
      recipientEmails: input.recipients,
    })
    await markCopyrightEmailIntakeResponseBouncedBySesMessageId(input.ses_message_id)
  }
}

function isTerminalCopyrightDeliveryFailure(input: CreateSesBounceEventInput): boolean {
  return (
    input.notification_type === 'complaint' ||
    (input.notification_type === 'bounce' && input.bounce_type === 'permanent')
  )
}

function buildCreateSesBounceEventInput(notification: SesNotification): CreateSesBounceEventInput {
  const rawEventType = notification.eventType ?? notification.notificationType
  const notificationType = rawEventType?.toLowerCase()
  assert(
    notificationType === 'bounce' ||
      notificationType === 'complaint' ||
      notificationType === 'delivery',
    422,
    `Unrecognized SES event type: ${rawEventType}`,
  )

  const input: CreateSesBounceEventInput = {
    notification_type: notificationType,
    recipients: [],
    ses_message_id: notification.mail?.messageId ?? null,
    ses_feedback_id: null,
    ses_timestamp: null,
    raw_message: notification,
    bounce_type: null,
    bounce_sub_type: null,
    diagnostic_code: null,
    reporting_mta: null,
  }
  let timestamp = notification.mail?.timestamp ?? null

  if (notificationType === 'bounce') {
    assert(notification.bounce, 422, 'Bounce notification missing .bounce')
    const bouncedRecipients = Array.isArray(notification.bounce.bouncedRecipients)
      ? notification.bounce.bouncedRecipients
      : []
    input.bounce_type =
      (notification.bounce.bounceType?.toLowerCase() as CreateSesBounceEventInput['bounce_type']) ??
      null
    input.bounce_sub_type = notification.bounce.bounceSubType ?? null
    input.recipients = bouncedRecipients.flatMap(r =>
      typeof r?.emailAddress === 'string' ? [r.emailAddress] : [],
    )
    input.ses_feedback_id = notification.bounce.feedbackId ?? null
    timestamp = notification.bounce.timestamp ?? timestamp
    input.reporting_mta = notification.bounce.reportingMTA ?? null
    const diagnosticCodes = bouncedRecipients.flatMap(r =>
      r?.diagnosticCode ? [r.diagnosticCode] : [],
    )
    input.diagnostic_code = diagnosticCodes[0] ?? null
  } else if (notificationType === 'complaint') {
    assert(notification.complaint, 422, 'Complaint notification missing .complaint')
    const complainedRecipients = Array.isArray(notification.complaint.complainedRecipients)
      ? notification.complaint.complainedRecipients
      : []
    input.recipients = complainedRecipients.flatMap(r =>
      typeof r?.emailAddress === 'string' ? [r.emailAddress] : [],
    )
    input.ses_feedback_id = notification.complaint.feedbackId ?? null
    timestamp = notification.complaint.timestamp ?? timestamp
  } else {
    assert(notification.delivery, 422, 'Delivery notification missing .delivery')
    input.recipients = Array.isArray(notification.delivery.recipients)
      ? notification.delivery.recipients
      : []
    timestamp = notification.delivery.timestamp ?? timestamp
    input.reporting_mta = notification.delivery.reportingMTA ?? null
  }

  if (timestamp) {
    const ts = new Date(timestamp)
    assert(!Number.isNaN(ts.getTime()), 422, `Invalid SES timestamp: ${timestamp}`)
    input.ses_timestamp = ts
  }

  return input
}
