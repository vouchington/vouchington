'use client'
/* oxlint-disable max-lines -- thread actions, compose state, and race-safe pagination form one client boundary */

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TimeAgo } from '@/components/shared/time-ago'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import {
  getModmailMessagesClient,
  sendModmailMessage,
  resolveModmailThread,
  type ModmailThread,
  type ModmailMessage,
} from '@/lib/api/client/modmail'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ModmailMessageList } from './modmail-message-list'

interface Props {
  communitySlug: string
  thread: ModmailThread
  initialMessages: ModmailMessage[]
  initialHasMore: boolean
  initialEndCursor: string | null
  isMod: boolean
}

export function ModmailThreadClient({
  communitySlug,
  thread: initialThread,
  initialMessages,
  initialHasMore,
  initialEndCursor,
  isMod,
}: Props) {
  const t = useTranslations()
  const [messages, setMessages] = useState<ModmailMessage[]>(initialMessages)
  const [thread, setThread] = useState<ModmailThread>(initialThread)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<Error | null>(null)
  const endCursorRef = useRef<string | null>(initialEndCursor)
  const generationRef = useRef(0)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    generationRef.current += 1
    return () => {
      generationRef.current += 1
    }
  }, [communitySlug, initialThread.id])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setText('')
    setSending(true)
    try {
      const result = await sendModmailMessage(communitySlug, thread.id, trimmed)
      setMessages(prev => [...prev, result.message])
    } catch (error) {
      onError(error, {
        fallback: t('extracted.threadid.modmailThreadClient.failedToSendMessage_66b8e077'),
      })
    } finally {
      setSending(false)
    }
  }

  async function handleLoadMore() {
    const cursor = endCursorRef.current
    if (!cursor || loadingMoreRef.current) return
    const generation = generationRef.current
    const contextSlug = communitySlug
    const contextThreadId = thread.id
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const res = await getModmailMessagesClient(contextSlug, contextThreadId, {
        after: cursor,
      })
      if (
        generation !== generationRef.current ||
        contextSlug !== communitySlug ||
        contextThreadId !== thread.id
      )
        return
      setMessages(prev => prependUniqueMessages(prev, res.results))
      setHasMore(res.page_info.has_next_page)
      endCursorRef.current = res.page_info.end_cursor
    } catch (error) {
      if (
        generation === generationRef.current &&
        contextSlug === communitySlug &&
        contextThreadId === thread.id
      ) {
        setLoadMoreError(error instanceof Error ? error : new Error(String(error)))
        onError(error, {
          fallback: t('extracted.threadid.modmailThreadClient.failedToLoadMoreMessages_d37c5429'),
        })
      }
    } finally {
      if (
        generation === generationRef.current &&
        contextSlug === communitySlug &&
        contextThreadId === thread.id
      ) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }

  async function handleResolve() {
    try {
      const result = await resolveModmailThread(communitySlug, thread.id)
      setThread(result.thread)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.threadid.modmailThreadClient.failedToResolveThread_55590a32'),
      })
    }
  }

  return (
    <div
      className='flex flex-col gap-4'
      data-pw='modmail-thread-view'
    >
      <div className='flex items-center justify-between gap-4 rounded-lg border bg-card p-4'>
        <div className='space-y-1 text-sm text-muted-foreground'>
          {thread.subject_user_id && (
            <p>
              {t('extracted.threadid.modmailThreadClient.memberSubjectuserid_d67b2b8c', {
                subjectUserId: thread.subject_user_id,
              })}
            </p>
          )}
          {thread.assigned_mod_id && (
            <p>
              {t('extracted.threadid.modmailThreadClient.assignedToAssignedmodid_3baaa2ab', {
                assignedModId: thread.assigned_mod_id,
              })}
            </p>
          )}
          <p>
            {t('extracted.threadid.modmailThreadClient.opened_b19fb8d1')}{' '}
            <TimeAgo date={thread.created_at} />
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Badge variant={thread.resolved_at ? 'secondary' : 'default'}>
            {thread.resolved_at
              ? t('extracted.threadid.modmailThreadClient.resolved_dc676b42')
              : t('extracted.threadid.modmailThreadClient.open_2348f998')}
          </Badge>
          {!thread.resolved_at && isMod && (
            <Button
              size='sm'
              variant='outline'
              onClick={() => {
                handleResolve().catch(() => {
                  // error handled in handleResolve
                })
              }}
              data-pw='modmail-resolve-button'
            >
              {t('extracted.threadid.modmailThreadClient.resolve_c8f193b3')}
            </Button>
          )}
        </div>
      </div>

      {hasMore && !loadMoreError ? (
        <div className='flex justify-center'>
          <Button
            variant='outline'
            size='sm'
            disabled={loadingMore}
            loading={loadingMore}
            data-pw='modmail-thread-load-more'
            onClick={() => {
              handleLoadMore().catch(() => {})
            }}
          >
            {t('extracted.threadid.modmailThreadClient.loadOlderMessages_f17671d8')}
          </Button>
        </div>
      ) : null}
      <PaginatedListFooter
        mode='retry-only'
        fetchError={loadMoreError}
        canLoadMore={hasMore}
        loadingMore={loadingMore}
        clearError={() => setLoadMoreError(null)}
        loadMore={() => {
          handleLoadMore().catch(() => {})
        }}
      />

      <ModmailMessageList messages={messages} />

      {!thread.resolved_at && (
        <form
          className='flex flex-col gap-2'
          onSubmit={e => {
            e.preventDefault()
            handleSend().catch(() => {
              // error handled in handleSend
            })
          }}
        >
          <Textarea
            placeholder={t('extracted.threadid.modmailThreadClient.writeAReply_182fe0aa')}
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={sending}
            data-pw='modmail-compose-input'
          />
          <Button
            type='submit'
            disabled={sending || !text.trim()}
            data-pw='modmail-send-button'
          >
            {t('extracted.threadid.modmailThreadClient.send_f6f4688f')}
          </Button>
        </form>
      )}
    </div>
  )
}

function prependUniqueMessages(
  existing: ModmailMessage[],
  incoming: ModmailMessage[],
): ModmailMessage[] {
  const seen = new Set(existing.map(message => message.id))
  const uniqueIncoming = incoming.filter(message => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
  return [...uniqueIncoming, ...existing]
}
