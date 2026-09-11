import { ApiError } from '@/lib/api/error'
import { pollForSupportDraft } from '@/lib/api/client/support-draft-polling'
import type { SupportMessage, SupportMessagesResponse } from '@/types/support'

function isAmbiguousDraftRequestFailure(error: unknown): error is Error {
  const transportError = error instanceof ApiError ? error.data : error
  return transportError instanceof Error && transportError.name !== 'AbortError'
}

export async function requestSupportDraftWithReconciliation({
  existingMessageIds,
  fetchMessages,
  requestDraft,
}: {
  existingMessageIds: ReadonlySet<string>
  fetchMessages: () => Promise<SupportMessagesResponse>
  requestDraft: () => Promise<unknown>
}): Promise<SupportMessagesResponse | null> {
  let ambiguousRequestError: Error | undefined
  try {
    await requestDraft()
  } catch (error) {
    if (!isAmbiguousDraftRequestFailure(error)) throw error
    ambiguousRequestError = error
  }

  const draftedPage = await pollForSupportDraft({ existingMessageIds, fetchMessages })
  if (!draftedPage && ambiguousRequestError) throw ambiguousRequestError
  return draftedPage
}

export function shouldHideGenerateSupportDraft(
  messages: SupportMessage[],
  hasNextPage: boolean,
): boolean {
  return (
    messages.some(
      message =>
        message.drafted_at !== null && message.direction === 'outbound' && message.sent_at === null,
    ) ||
    (!hasNextPage && !messages.some(message => message.direction === 'inbound'))
  )
}
