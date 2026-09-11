'use client'

import { useReducer } from 'react'
import { Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useAuth } from '@/lib/auth/context'
import {
  getAdminSupportThreadMessagesClient,
  patchAdminSupportThread,
  postAdminSupportThreadDraft,
  postAdminSupportThreadMessage,
} from '@/lib/api/client/support'
import { ApiError } from '@/lib/api/error'
import { SUPPORT_DETAIL_PAGE_SIZE } from '@/lib/api/support-detail-page-size'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { SupportMessage, SupportMessagesResponse, SupportThread } from '@/types/support'
import { AdminSupportReplyComposer } from './admin-support-reply-composer'
import { AdminSupportThreadHeader } from './admin-support-thread-header'
import { AdminSupportThreadMessageList } from './admin-support-thread-message-list'
import {
  requestSupportDraftWithReconciliation,
  shouldHideGenerateSupportDraft,
} from './support-draft-request-reconciliation'
import { useTranslations } from '@/lib/i18n/use-translations'

interface State {
  thread: SupportThread
  appendedMessages: SupportMessage[]
  updatedMessages: Record<string, SupportMessage>
  replyText: string
  actionLoading: string | null
  actionError: string | null
  replyLoading: boolean
  draftLoading: boolean
}
type Action = Partial<State> | ((state: State) => Partial<State>)
function reducer(state: State, action: Action): State {
  return { ...state, ...(typeof action === 'function' ? action(state) : action) }
}
export function AdminSupportThreadDetailClient({
  thread: initialThread,
  initialMessagesData,
}: {
  thread: SupportThread
  initialMessagesData: SupportMessagesResponse
}) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  const [state, dispatch] = useReducer(reducer, {
    thread: initialThread,
    appendedMessages: [],
    updatedMessages: {},
    replyText: '',
    actionLoading: null,
    actionError: null,
    replyLoading: false,
    draftLoading: false,
  })
  const { pages, hasNextPage, loadMore, loadingMore, fetchError, clearError, replaceFirstPage } =
    usePaginatedList(initialMessagesData, `/api/v1/support/threads/${initialThread.id}/messages`, {
      limit: SUPPORT_DETAIL_PAGE_SIZE,
    })
  const pageMessages = mergePageResultsById(pages.toReversed())
  const messages = mergePageResultsById([
    { results: pageMessages },
    { results: state.appendedMessages },
  ]).map(message => state.updatedMessages[message.id] ?? message)
  function updateMessage(updated: SupportMessage) {
    dispatch(current => ({
      updatedMessages: { ...current.updatedMessages, [updated.id]: updated },
    }))
  }
  async function refreshMessages() {
    const firstPage = await getAdminSupportThreadMessagesClient(state.thread.id, {
      limit: SUPPORT_DETAIL_PAGE_SIZE,
    })
    const refreshedIds = new Set(firstPage.results.map(message => message.id))
    dispatch(current => {
      const updatedMessages = Object.fromEntries(
        Object.entries(current.updatedMessages).filter(([id]) => !refreshedIds.has(id)),
      )
      return { updatedMessages }
    })
    replaceFirstPage?.(firstPage)
  }
  async function patchThread(
    body: { assigned_to_id: string } | { resolved: boolean },
    action: string,
  ) {
    dispatch({ actionLoading: action, actionError: null })
    try {
      const data = await patchAdminSupportThread(state.thread.id, body)
      dispatch({ thread: data.thread })
    } catch (error) {
      dispatch({ actionError: error instanceof ApiError ? error.message : `Failed to ${action}` })
    } finally {
      dispatch({ actionLoading: null })
    }
  }
  async function handleSendReply() {
    if (!state.replyText.trim()) return
    dispatch({ replyLoading: true, actionError: null })
    try {
      const data = await postAdminSupportThreadMessage(state.thread.id, {
        body_text: state.replyText,
      })
      dispatch(current => ({
        appendedMessages: [...current.appendedMessages, data.message],
        replyText: '',
      }))
    } catch (error) {
      dispatch({ actionError: error instanceof ApiError ? error.message : 'Failed to save reply' })
    } finally {
      dispatch({ replyLoading: false })
    }
  }
  async function handleGenerateDraft() {
    dispatch({ draftLoading: true, actionError: null })
    try {
      const draftedPage = await requestSupportDraftWithReconciliation({
        existingMessageIds: new Set(messages.map(message => message.id)),
        fetchMessages: () =>
          getAdminSupportThreadMessagesClient(state.thread.id, {
            limit: SUPPORT_DETAIL_PAGE_SIZE,
          }),
        requestDraft: () => postAdminSupportThreadDraft(state.thread.id),
      })
      if (!draftedPage) throw new Error('Draft generation timed out')
      replaceFirstPage?.(draftedPage)
    } catch (error) {
      dispatch({
        actionError: error instanceof ApiError ? error.message : 'Failed to generate AI draft',
      })
    } finally {
      dispatch({ draftLoading: false })
    }
  }
  return (
    <div className='space-y-4'>
      <AdminSupportThreadHeader
        actionError={state.actionError}
        actionLoading={state.actionLoading}
        handleAssignToMe={() =>
          currentUser && patchThread({ assigned_to_id: currentUser.id }, 'assign')
        }
        handleReopen={() => patchThread({ resolved: false }, 'reopen')}
        handleResolve={() => patchThread({ resolved: true }, 'resolve')}
        thread={state.thread}
      />

      <AdminSupportThreadMessageList
        clearError={clearError}
        fetchError={fetchError}
        hasNextPage={hasNextPage}
        loadMore={() => {
          void loadMore()
        }}
        loadingMore={loadingMore}
        messages={messages}
        onMessageUpdate={updateMessage}
        onRefreshMessages={refreshMessages}
        threadId={state.thread.id}
        threadResolved={state.thread.status === 'resolved'}
      />

      {state.thread.status !== 'resolved' && (
        <>
          <div className='flex justify-end'>
            <Button
              data-pw='support-thread-generate-ai-draft'
              variant='outline'
              size='sm'
              onClick={() => {
                void handleGenerateDraft()
              }}
              loading={state.draftLoading}
              disabled={state.draftLoading}
              hidden={shouldHideGenerateSupportDraft(messages, hasNextPage)}
            >
              {!state.draftLoading && <Wand2 className='mr-2 h-4 w-4' />}
              {state.draftLoading
                ? t('extracted.threadid.adminSupportThreadDetailClient.waitingForAiDraft_9e58a008')
                : t('extracted.threadid.adminSupportThreadDetailClient.generateAiDraft_77089d21')}
            </Button>
          </div>

          <AdminSupportReplyComposer
            handleReplyTextChange={event => dispatch({ replyText: event.target.value })}
            handleSendReply={() => {
              void handleSendReply()
            }}
            replyLoading={state.replyLoading}
            replyText={state.replyText}
          />
        </>
      )}
    </div>
  )
}
