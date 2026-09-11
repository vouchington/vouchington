import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { SupportMessage } from './types.mts'
export type PersistedInboundEmail = {
  isNew: boolean
  threadId: string
  messageId: string
  message?: SupportMessage
  embeddingEnqueued: boolean
  customerSupportEnqueued: boolean
  customerSupportCompleted: boolean
}
export type InboundReceipt = {
  s3_object_key: string
  support_thread_id: string | null
  support_message_id: string | null
  processed_at: Date | null
  embedding_enqueued_at: Date | null
  customer_support_enqueued_at: Date | null
  customer_support_completed_at: Date | null
}
type InboundMessageRegistration = {
  support_thread_id: string
  support_message_id: string
}
export async function isInboundSupportEmailComplete(sesMessageId: string): Promise<boolean> {
  const { rows } = await read(sql`/* isInboundSupportEmailComplete */
    SELECT embedding_enqueued_at IS NOT NULL
       AND customer_support_enqueued_at IS NOT NULL AS complete
    FROM support_inbound_email_receipts
    WHERE ses_message_id = ${sesMessageId}
  `)
  return (rows[0] as { complete: boolean } | undefined)?.complete ?? false
}
export async function reserveAndLockInboundReceipt(
  sesMessageId: string,
  s3ObjectKey: string,
  options: QueryOptions,
): Promise<InboundReceipt> {
  await write(
    sql`/* reserveAndLockInboundReceipt */
      INSERT INTO support_inbound_email_receipts (ses_message_id, s3_object_key)
      VALUES (${sesMessageId}, ${s3ObjectKey})
      ON CONFLICT (ses_message_id) DO NOTHING
    `,
    options,
  )
  const { rows } = await write(
    sql`/* reserveAndLockInboundReceipt */
      SELECT s3_object_key, support_thread_id, support_message_id,
             processed_at, embedding_enqueued_at, customer_support_enqueued_at,
             customer_support_completed_at
      FROM support_inbound_email_receipts
      WHERE ses_message_id = ${sesMessageId}
      FOR UPDATE
    `,
    options,
  )
  const receipt = rows[0] as InboundReceipt | undefined
  if (!receipt) throw new Error(`Failed to reserve SES receipt: ${sesMessageId}`)
  return receipt
}
export function assertReceiptObjectKey(
  receipt: InboundReceipt,
  sesMessageId: string,
  s3ObjectKey: string,
): void {
  if (receipt.s3_object_key !== s3ObjectKey) {
    throw new Error(`SES receipt ${sesMessageId} is already bound to another S3 object`)
  }
}

export function completedReceiptResult(receipt: InboundReceipt): PersistedInboundEmail {
  if (!receipt.support_thread_id || !receipt.support_message_id) {
    throw new Error('Processed SES receipt is missing its support message')
  }
  return {
    isNew: false,
    threadId: receipt.support_thread_id,
    messageId: receipt.support_message_id,
    embeddingEnqueued: receipt.embedding_enqueued_at != null,
    customerSupportEnqueued: receipt.customer_support_enqueued_at != null,
    customerSupportCompleted: receipt.customer_support_completed_at != null,
  }
}

export async function reserveInboundEmailMessageId(
  emailMessageId: string,
  options: QueryOptions,
): Promise<boolean> {
  const { rows } = await write(
    sql`/* reserveInboundEmailMessageId */
      INSERT INTO support_inbound_email_message_ids (email_message_id)
      VALUES (${emailMessageId})
      ON CONFLICT (email_message_id) DO NOTHING
      RETURNING email_message_id
    `,
    options,
  )
  return rows.length > 0
}

export async function getInboundMessageRegistration(
  emailMessageId: string,
  options: QueryOptions,
): Promise<InboundMessageRegistration | null> {
  const { rows } = await write(
    sql`/* getInboundMessageRegistration */
      SELECT support_thread_id, support_message_id
      FROM support_inbound_email_message_ids
      WHERE email_message_id = ${emailMessageId}
        AND completed_at IS NOT NULL
    `,
    options,
  )
  return (rows[0] as InboundMessageRegistration | undefined) ?? null
}

export async function completeInboundEmailMessageId(
  emailMessageId: string,
  threadId: string,
  messageId: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* completeInboundEmailMessageId */
      UPDATE support_inbound_email_message_ids
      SET support_thread_id = ${threadId}, support_message_id = ${messageId},
          completed_at = CURRENT_TIMESTAMP
      WHERE email_message_id = ${emailMessageId}
        AND support_thread_id IS NULL AND support_message_id IS NULL
    `,
    options,
  )
}

export async function completeInboundReceipt(
  sesMessageId: string,
  emailMessageId: string | null,
  threadId: string,
  messageId: string,
  embeddingEnqueued: boolean,
  customerSupportEnqueued: boolean,
  customerSupportCompleted: boolean,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* completeInboundReceipt */
      UPDATE support_inbound_email_receipts
      SET email_message_id = ${emailMessageId}, support_thread_id = ${threadId},
          support_message_id = ${messageId}, processed_at = CURRENT_TIMESTAMP,
          embedding_enqueued_at = ${embeddingEnqueued ? new Date() : null},
          customer_support_enqueued_at = ${customerSupportEnqueued ? new Date() : null},
          customer_support_completed_at = ${customerSupportCompleted ? new Date() : null}
      WHERE ses_message_id = ${sesMessageId} AND processed_at IS NULL
    `,
    options,
  )
}

export async function markInboundReceiptEmbeddingEnqueued(sesMessageId: string): Promise<void> {
  await write(sql`/* markInboundReceiptEmbeddingEnqueued */
    UPDATE support_inbound_email_receipts
    SET embedding_enqueued_at = CURRENT_TIMESTAMP
    WHERE ses_message_id = ${sesMessageId}
      AND processed_at IS NOT NULL AND embedding_enqueued_at IS NULL
  `)
}

export async function markInboundReceiptCustomerSupportEnqueued(
  sesMessageId: string,
): Promise<void> {
  await write(sql`/* markInboundReceiptCustomerSupportEnqueued */
    UPDATE support_inbound_email_receipts
    SET customer_support_enqueued_at = CURRENT_TIMESTAMP
    WHERE ses_message_id = ${sesMessageId}
      AND processed_at IS NOT NULL AND customer_support_enqueued_at IS NULL
  `)
}
