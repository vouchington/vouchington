import type { QueryOptions } from '@data-stores/psql'
import { getOrCreateSupportContactByEmail } from './contacts.mts'
import { getFirstSupportThreadIdByEmailMessageIds } from './get-support-message-by-id.mts'
import { lockSupportThread } from './lock-support-thread.mts'
import { coordinateLockedInboundSupportThread } from './supersede-active-staff-draft-generation.mts'
import { createSupportThread } from './threads.mts'

export async function prepareInboundSupportMessageTarget(
  fromEmail: string,
  fromName: string | undefined,
  subject: string,
  replyRefs: string[],
  options: QueryOptions,
): Promise<{ threadId: string; suppressAutomaticDraft: boolean }> {
  const contact = await getOrCreateSupportContactByEmail(fromEmail, fromName, options)
  const existingThreadId = await getFirstSupportThreadIdByEmailMessageIds(replyRefs, options)
  if (!existingThreadId) {
    const thread = await createSupportThread(contact.id, subject, { ...options, skipEnqueue: true })
    return { threadId: thread.id, suppressAutomaticDraft: false }
  }

  await lockSupportThread(existingThreadId, options)
  const suppressAutomaticDraft = await coordinateLockedInboundSupportThread(
    existingThreadId,
    options,
  )
  return { threadId: existingThreadId, suppressAutomaticDraft }
}
