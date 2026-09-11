import { beginTransaction } from '@data-stores/psql'
import { enqueueCustomerSupportAwaited } from '@queues/ai-agents/enqueues/customer-support'
import { enqueueEmbedSupportMessage } from '@queues/customer-support/enqueues'
import { isInboundCustomerSupportCompleted } from './inbound-customer-support-completion.mts'
import { prepareInboundSupportMessageTarget } from './inbound-thread-coordination.mts'
import { persistInboundSupportMessage } from './persist-inbound-support-message.mts'
import {
  normalizeInboundEmailMessageId,
  normalizeInboundEmailMessageIds,
} from './normalize-inbound-email-ids.mts'
import type { SupportMessage } from './types.mts'
import {
  assertReceiptObjectKey,
  completeInboundEmailMessageId,
  completeInboundReceipt,
  completedReceiptResult,
  getInboundMessageRegistration,
  markInboundReceiptCustomerSupportEnqueued,
  markInboundReceiptEmbeddingEnqueued,
  reserveAndLockInboundReceipt,
  reserveInboundEmailMessageId,
  type PersistedInboundEmail,
} from './inbound-email-receipts.mts'
import { getInboundReceiptFollowUpState } from './inbound-email-receipt-follow-up-state.mts'
type InboundFollowUpDependencies = {
  enqueueEmbedding(threadId: string, messageId: string, logicalJobId: string): Promise<unknown>
  enqueueCustomerSupport(
    threadId: string,
    messageId: string,
    logicalJobId: string,
  ): Promise<unknown>
  beforePersistInboundMessage?(): Promise<void>
}
const inboundFollowUpDependencies: InboundFollowUpDependencies = {
  async enqueueEmbedding(threadId, messageId, logicalJobId) {
    await enqueueEmbedSupportMessage(threadId, messageId, undefined, logicalJobId)
  },
  async enqueueCustomerSupport(threadId, messageId, logicalJobId) {
    await enqueueCustomerSupportAwaited(threadId, {
      logicalJobId,
      supportMessageId: messageId,
    })
  },
}
type CreateInboundSupportEmailMessageParams = {
  sesMessageId: string
  s3ObjectKey: string
  fromEmail: string
  fromName?: string
  subject: string
  bodyText: string
  emailMessageId?: string | null
  replyRef?: string | null
  replyRefs?: Array<string | null | undefined>
  emailTo: string
}
export type CreateInboundSupportEmailMessageResult =
  | {
      is_new: true
      threadId: string
      message: SupportMessage
    }
  | {
      is_new: false
    }
export async function createInboundSupportEmailMessage(
  params: CreateInboundSupportEmailMessageParams,
  followUpDependencies: InboundFollowUpDependencies = inboundFollowUpDependencies,
): Promise<CreateInboundSupportEmailMessageResult> {
  const emailMessageId = normalizeInboundEmailMessageId(params.emailMessageId)
  const replyRefs = normalizeInboundEmailMessageIds(params.replyRefs ?? [params.replyRef])
  await using query = await beginTransaction()
  const queryOptions = { query }
  const receipt = await reserveAndLockInboundReceipt(
    params.sesMessageId,
    params.s3ObjectKey,
    queryOptions,
  )
  assertReceiptObjectKey(receipt, params.sesMessageId, params.s3ObjectKey)
  let persisted: PersistedInboundEmail
  if (receipt.processed_at) {
    persisted = completedReceiptResult(receipt)
  } else {
    const reserved = emailMessageId
      ? await reserveInboundEmailMessageId(emailMessageId, queryOptions)
      : true
    if (emailMessageId && !reserved) {
      const registration = await getInboundMessageRegistration(emailMessageId, queryOptions)
      if (!registration) {
        throw new Error(`Inbound email Message-ID reservation is incomplete: ${emailMessageId}`)
      }
      const receiptFollowUpState = await getInboundReceiptFollowUpState(
        registration.support_thread_id,
        registration.support_message_id,
        queryOptions,
      )
      const customerSupportCompleted =
        receiptFollowUpState.customerSupportCompleted ||
        (await isInboundCustomerSupportCompleted(
          registration.support_thread_id,
          registration.support_message_id,
          queryOptions,
        ))
      const customerSupportEnqueued =
        receiptFollowUpState.customerSupportEnqueued || customerSupportCompleted
      await completeInboundReceipt(
        params.sesMessageId,
        emailMessageId,
        registration.support_thread_id,
        registration.support_message_id,
        receiptFollowUpState.embeddingEnqueued,
        customerSupportEnqueued,
        customerSupportCompleted,
        queryOptions,
      )
      persisted = {
        isNew: false,
        threadId: registration.support_thread_id,
        messageId: registration.support_message_id,
        embeddingEnqueued: receiptFollowUpState.embeddingEnqueued,
        customerSupportEnqueued,
        customerSupportCompleted,
      } satisfies PersistedInboundEmail
    } else {
      const { threadId, suppressAutomaticDraft } = await prepareInboundSupportMessageTarget(
        params.fromEmail,
        params.fromName,
        params.subject,
        replyRefs,
        queryOptions,
      )
      const message = await persistInboundSupportMessage(
        threadId,
        {
          bodyText: params.bodyText,
          emailMessageId: emailMessageId ?? undefined,
          subject: params.subject,
          fromEmail: params.fromEmail,
          toEmail: params.emailTo,
        },
        queryOptions,
        followUpDependencies.beforePersistInboundMessage,
      )
      if (emailMessageId) {
        await completeInboundEmailMessageId(emailMessageId, threadId, message.id, queryOptions)
      }
      await completeInboundReceipt(
        params.sesMessageId,
        emailMessageId,
        threadId,
        message.id,
        false,
        suppressAutomaticDraft,
        suppressAutomaticDraft,
        queryOptions,
      )

      persisted = {
        isNew: true,
        threadId,
        messageId: message.id,
        message,
        embeddingEnqueued: false,
        customerSupportEnqueued: suppressAutomaticDraft,
        customerSupportCompleted: suppressAutomaticDraft,
      } satisfies PersistedInboundEmail
    }
  }

  await query.commit()
  const logicalJobIdPrefix = `support_inbound_email__${persisted.messageId}`
  if (!persisted.embeddingEnqueued) {
    await followUpDependencies.enqueueEmbedding(
      persisted.threadId,
      persisted.messageId,
      `${logicalJobIdPrefix}__embedding`,
    )
    await markInboundReceiptEmbeddingEnqueued(params.sesMessageId)
  }
  if (!persisted.customerSupportEnqueued) {
    await followUpDependencies.enqueueCustomerSupport(
      persisted.threadId,
      persisted.messageId,
      `${logicalJobIdPrefix}__customer_support`,
    )
    await markInboundReceiptCustomerSupportEnqueued(params.sesMessageId)
  }

  if (!persisted.isNew) return { is_new: false }
  if (!persisted.message) throw new Error('New inbound support email is missing its message')
  return { is_new: true, threadId: persisted.threadId, message: persisted.message }
}
