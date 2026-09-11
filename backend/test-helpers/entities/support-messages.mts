import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestSupportMessageLifecycleChange = {
  change_type: string
  changed_by_id: string | null
  metadata: Record<string, unknown>
  drafted_at: Date | null
  edited_at: Date | null
  edited_by_id: string | null
  approved_at: Date | null
  approved_by_id: string | null
  sent_at: Date | null
}

type InsertTestSupportMessageOptions = {
  supportThreadId: string
  direction?: 'inbound' | 'outbound'
  bodyText?: string
  bodyHtml?: string
  createdById?: string | null
  emailMessageId?: string | null
  emailSubject?: string | null
  emailFrom?: string | null
  emailTo?: string | null
  draftedAt?: Date | null
  approvedAt?: Date | null
  approvedById?: string | null
  sentAt?: Date | null
}

export async function insertTestSupportMessage(options: InsertTestSupportMessageOptions) {
  const query = sql`
    INSERT INTO support_messages (
      support_thread_id,
      direction,
      body_text,
      body_html,
      created_by_id,
      email_message_id,
      email_subject,
      email_from,
      email_to,
      drafted_at,
      approved_at,
      approved_by_id,
      sent_at
    ) VALUES (
      ${options.supportThreadId},
      ${options.direction ?? 'inbound'},
      ${options.bodyText ?? 'Test message body'},
      ${options.bodyHtml ?? ''},
      ${options.createdById ?? null},
      ${options.emailMessageId ?? null},
      ${options.emailSubject ?? null},
      ${options.emailFrom ?? null},
      ${options.emailTo ?? null},
      ${options.draftedAt ?? null},
      ${options.approvedAt ?? null},
      ${options.approvedById ?? null},
      ${options.sentAt ?? null}
    )
    RETURNING id
  `
  const { rows } = await write(query)
  return { id: rows[0].id as string }
}

export async function countSupportMessagesByEmailMessageId(
  emailMessageId: string,
): Promise<number> {
  const { rows } = await read(sql`/* countSupportMessagesByEmailMessageId */
    SELECT COUNT(*)::INT AS count
    FROM support_messages
    WHERE email_message_id = ${emailMessageId}
  `)
  return rows[0].count as number
}

export async function countSupportInboundEmailMessageIdRegistryRows(
  emailMessageId: string,
): Promise<number> {
  const { rows } = await read(sql`/* countSupportInboundEmailMessageIdRegistryRows */
    SELECT COUNT(*)::INT AS count
    FROM support_inbound_email_message_ids
    WHERE email_message_id = ${emailMessageId}
  `)
  return rows[0].count as number
}

export async function insertTestIncompleteSupportInboundEmailMessageId(
  emailMessageId: string,
): Promise<void> {
  await write(sql`/* insertTestIncompleteSupportInboundEmailMessageId */
    INSERT INTO support_inbound_email_message_ids (email_message_id)
    VALUES (${emailMessageId})
  `)
}

export async function countSupportInboundEmailReceiptRows(sesMessageId: string): Promise<number> {
  const { rows } = await read(sql`/* countSupportInboundEmailReceiptRows */
    SELECT COUNT(*)::INT AS count
    FROM support_inbound_email_receipts
    WHERE ses_message_id = ${sesMessageId}
  `)
  return rows[0].count as number
}

export async function getTestSupportInboundEmailFollowUpReceipt(sesMessageId: string): Promise<{
  embedding_enqueued_at: Date | null
  customer_support_enqueued_at: Date | null
  customer_support_completed_at: Date | null
} | null> {
  const { rows } = await read(sql`/* getTestSupportInboundEmailFollowUpReceipt */
    SELECT embedding_enqueued_at, customer_support_enqueued_at,
           customer_support_completed_at
    FROM support_inbound_email_receipts
    WHERE ses_message_id = ${sesMessageId}
  `)
  return (
    (rows[0] as
      | {
          embedding_enqueued_at: Date | null
          customer_support_enqueued_at: Date | null
          customer_support_completed_at: Date | null
        }
      | undefined) ?? null
  )
}
export async function insertTestSupportInboundEmailReceipt(options: {
  sesMessageId: string
  supportThreadId: string
  supportMessageId: string
  customerSupportEnqueuedAt?: Date | null
  customerSupportCompletedAt?: Date | null
}): Promise<void> {
  await write(sql`/* insertTestSupportInboundEmailReceipt */
    INSERT INTO support_inbound_email_receipts (
      ses_message_id, s3_object_key, support_thread_id, support_message_id,
      processed_at, embedding_enqueued_at, customer_support_enqueued_at,
      customer_support_completed_at
    ) VALUES (
      ${options.sesMessageId}, ${`incoming/${options.sesMessageId}`},
      ${options.supportThreadId}, ${options.supportMessageId},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
      ${options.customerSupportEnqueuedAt === undefined ? new Date() : options.customerSupportEnqueuedAt},
      ${options.customerSupportCompletedAt === undefined ? null : options.customerSupportCompletedAt}
    )
  `)
}

export async function countSupportThreadsBySubject(subject: string): Promise<number> {
  const { rows } = await read(sql`/* countSupportThreadsBySubject */
    SELECT COUNT(*)::INT AS count
    FROM support_threads
    WHERE subject = ${subject}
  `)
  return rows[0].count as number
}

export async function getTestSupportMessageLifecycleChanges(
  threadId: string,
  messageId: string,
): Promise<TestSupportMessageLifecycleChange[]> {
  const { rows } = await read(sql`/* getTestSupportMessageLifecycleChanges */
    SELECT
      change_type,
      changed_by_id,
      metadata,
      drafted_at,
      edited_at,
      edited_by_id,
      approved_at,
      approved_by_id,
      sent_at
    FROM support_message_lifecycle_changes
    WHERE support_thread_id = ${threadId}
      AND support_message_id = ${messageId}
    ORDER BY id ASC
  `)
  return rows as TestSupportMessageLifecycleChange[]
}
