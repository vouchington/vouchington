import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { getCrmContact, markCrmContactContacted } from '@services/crm-contacts'
import { isEmailSuppressed } from '@services/ses-bounce-events'
import { enqueueSendCrmEmail } from '@queues/emails/enqueues'
import type { CrmMessage, SendCrmEmailInput } from './types.mts'
import { currentUserCanManageCrm } from '@services/crm-contacts/authorization'
import { createCrmMessage } from './create.mts'
import { read, beginTransaction, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function sendCrmEmail(
  currentUser: PrivateUser,
  contactId: string,
  input: SendCrmEmailInput,
): Promise<CrmMessage> {
  assert(currentUserCanManageCrm(currentUser), 403, 'Forbidden')
  assert(input.subject?.trim(), 422, 'subject is required')
  assert(input.subject.trim().length <= 998, 422, 'subject must be at most 998 characters')
  assert(input.body_html || input.body_text, 422, 'body_html or body_text is required')

  const contact = await getCrmContact(contactId)
  assert(contact, 404, 'Contact not found')
  assert(!contact.opted_out_at, 422, 'Contact has opted out of CRM emails')
  assert(
    !(await isEmailSuppressed(contact.email)),
    422,
    'Contact email has been suppressed due to a prior bounce or complaint',
  )

  const conversationId = await getOrCreateCrmConversation(
    currentUser,
    contactId,
    input.subject.trim(),
  )

  const senderName = currentUser.username ?? currentUser.email_address ?? 'Admin'

  const message = await createCrmMessage({
    conversation_id: conversationId,
    contact_id: contactId,
    direction: 'outbound',
    from_email: currentUser.email_address ?? process.env.GMAIL_SMTP_USER ?? 'no-reply@voucha.ai',
    to_email: contact.email,
    subject: input.subject.trim(),
    body_html: input.body_html ?? null,
    body_text: input.body_text ?? null,
    email_provider: input.email_provider,
    sent_by_id: currentUser.id,
    ai_prompt: input.ai_prompt ?? null,
    ai_generated_at: input.ai_generated_at ?? null,
  })

  void enqueueSendCrmEmail(
    {
      emailAddress: contact.email,
      subject: input.subject.trim(),
      uiLocale: await getCrmContactUserUiLocale(contact.id),
    },
    {
      contactName: contact.name,
      senderName,
      bodyHtml: input.body_html ?? input.body_text ?? '',
      ctaUrl: input.cta_url ?? undefined,
      provider: input.email_provider,
    },
  )

  await markCrmContactContacted(contactId, currentUser.id)

  return message
}

async function getCrmContactUserUiLocale(contactId: string): Promise<string | undefined> {
  const { rows } = await read<{ ui_locale: string | null }>(sql`/* getCrmContactUserUiLocale */
    SELECT users.ui_locale
    FROM crm_contacts
    JOIN users ON users.id = crm_contacts.user_id
    WHERE crm_contacts.id = ${contactId}
    LIMIT 1
  `)
  return rows[0]?.ui_locale ?? undefined
}

export async function getOrCreateCrmConversation(
  currentUser: PrivateUser,
  contactId: string,
  title: string,
): Promise<string> {
  const existing = await getCrmConversationIdByContactId(contactId)
  if (existing) {
    await addAdminParticipant(existing, currentUser.id)
    return existing
  }

  await using query = await beginTransaction()

  await lockCrmContact(contactId, { query })

  const existingInTransaction = await getCrmConversationIdByContactId(contactId, { query })
  if (existingInTransaction) {
    await addAdminParticipant(existingInTransaction, currentUser.id, { query })
    await query.commit()
    return existingInTransaction
  }
  const { rows } = await write(
    sql`/* getOrCreateCrmConversation:createConversation */
        INSERT INTO conversations (channel_type, title, created_by_id)
        VALUES ('crm', ${title}, ${currentUser.id})
        RETURNING id
      `,
    { query },
  )
  const conversationId = rows[0].id as string

  await write(
    sql`/* getOrCreateCrmConversation:addContactParticipant */
        INSERT INTO conversation_participants (conversation_id, crm_contact_id, role)
        VALUES (${conversationId}, ${contactId}, 'owner')
      `,
    { query },
  )

  await addAdminParticipant(conversationId, currentUser.id, { query })

  await query.commit()
  return conversationId
}

async function getCrmConversationIdByContactId(
  contactId: string,
  options: Pick<QueryOptions, 'query'> = {},
): Promise<string | null> {
  const { rows } = await read(
    sql`/* getCrmConversationIdByContactId */
    SELECT c.id
    FROM conversations c
    JOIN conversation_participants cp ON cp.conversation_id = c.id
    WHERE c.channel_type = 'crm'
      AND cp.crm_contact_id = ${contactId}
      AND cp.removed_at IS NULL
    LIMIT 1
  `,
    options,
  )
  return (rows[0] as { id: string } | undefined)?.id ?? null
}

async function lockCrmContact(
  contactId: string,
  options: Pick<QueryOptions, 'query'>,
): Promise<void> {
  await write(
    sql`/* lockCrmContact */
      SELECT id
      FROM crm_contacts
      WHERE id = ${contactId}
      FOR UPDATE
    `,
    options,
  )
}

async function addAdminParticipant(
  conversationId: string,
  userId: string,
  options: Pick<QueryOptions, 'query'> = {},
): Promise<void> {
  await write(
    sql`/* addCrmAdminParticipant */
      INSERT INTO conversation_participants (conversation_id, user_id, role)
      VALUES (${conversationId}, ${userId}, 'admin')
      ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL AND removed_at IS NULL
      DO NOTHING
    `,
    options,
  )
}
