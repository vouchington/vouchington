'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { isActivePath } from '@/lib/utils/path'
import {
  getMyConversationsClient,
  deleteConversation,
  updateConversationTitle,
} from '@/lib/api/client/conversations'
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags'
import { useOptionalChatSidebar } from '@/lib/use-chat-sidebar'
import onError, { onSuccess } from '@/lib/on-error'
import { ChatsSidebarGroupView } from './chats-sidebar-group-view'
import { useTranslations } from '@/lib/i18n/use-translations'

const FIRST_PAGE_RETRY_DELAY_MS = 5000
const FIRST_PAGE_MAX_ATTEMPTS = 3

function scheduleFirstPageRetry(callback: () => void, attempt: number) {
  return setTimeout(callback, FIRST_PAGE_RETRY_DELAY_MS * attempt)
}

export function ChatsSidebarGroup() {
  const t = useTranslations()
  const pathname = usePathname()
  const { push } = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [fetchError, setFetchError] = useState<Error | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const chatSidebar = useOptionalChatSidebar()
  const isLoaded = chatSidebar?.isLoaded
  const replaceFirstPage = chatSidebar?.replaceFirstPage

  const featureFlags = useFeatureFlags()
  const chatEnabled = featureFlags.chat === true
  const showSupport = featureFlags.support === true

  useEffect(() => {
    if (!chatEnabled || isLoaded || !replaceFirstPage) return
    const replaceLoadedFirstPage = replaceFirstPage
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function fetchFirstPage(attempt: number) {
      getMyConversationsClient({ limit: 20 })
        .then(result => {
          if (!cancelled) replaceLoadedFirstPage(result.results, result.page_info)
        })
        .catch(() => {
          if (!cancelled && attempt < FIRST_PAGE_MAX_ATTEMPTS) {
            retryTimer = scheduleFirstPageRetry(() => fetchFirstPage(attempt + 1), attempt)
          }
        })
    }

    fetchFirstPage(1)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [chatEnabled, isLoaded, pathname, replaceFirstPage])

  if (!chatEnabled || !chatSidebar) return null

  const { conversations, pageInfo, appendPage, removeConversation, updateConversation } =
    chatSidebar

  async function handleLoadMore() {
    if (isLoadingMore || !pageInfo?.end_cursor) return
    setIsLoadingMore(true)
    setFetchError(null)
    try {
      const result = await getMyConversationsClient({ after: pageInfo.end_cursor, limit: 20 })
      appendPage(result.results, result.page_info)
    } catch (error) {
      setFetchError(error instanceof Error ? error : new Error(String(error)))
      onError(error, {
        fallback: t('extracted.chat.chatsSidebarGroup.failedToLoadMoreChats_17fe1c63'),
      })
    } finally {
      setIsLoadingMore(false)
    }
  }

  async function handleDelete(e: React.MouseEvent, conversationId: string) {
    e.preventDefault()
    if (deletingId) return
    setDeletingId(conversationId)
    try {
      await deleteConversation(conversationId)
      onSuccess(t('extracted.chat.chatsSidebarGroup.chatDeleted_150baea4'))
      removeConversation(conversationId)
      if (isActivePath(pathname, `/chat/${conversationId}`)) {
        push('/chat')
      }
    } catch (error) {
      onError(error, {
        fallback: t('extracted.chat.chatsSidebarGroup.failedToDeleteChat_9e9afb6c'),
        tags: { form: 'chat-delete' },
      })
    } finally {
      setDeletingId(null)
    }
  }

  function handleEditStart(conversationId: string, currentTitle: string) {
    setEditingId(conversationId)
    setEditValue(currentTitle)
  }

  function handleEditCancel() {
    setEditingId(null)
    setEditValue('')
  }

  async function handleEditSave(conversationId: string) {
    const trimmedValue = editValue.trim()
    setEditingId(null)
    setEditValue('')
    if (!trimmedValue) return
    const currentConv = conversations.find(c => c.id === conversationId)
    if (!currentConv || trimmedValue === currentConv.title) return
    const oldTitle = currentConv.title
    updateConversation(conversationId, { title: trimmedValue })
    try {
      await updateConversationTitle(conversationId, trimmedValue)
      onSuccess(t('extracted.chat.chatsSidebarGroup.chatRenamed_8ef577d3'))
    } catch (error) {
      updateConversation(conversationId, { title: oldTitle })
      onError(error, {
        fallback: t('extracted.chat.chatsSidebarGroup.failedToRenameChat_60707ef3'),
        tags: { form: 'chat-rename' },
      })
    }
  }

  const canLoadMore = pageInfo?.has_next_page === true && pageInfo.end_cursor !== null

  return (
    <InfiniteScroll
      hasNextPage={canLoadMore}
      endCursor={pageInfo?.end_cursor ?? null}
      onLoadMore={handleLoadMore}
      loadingMore={isLoadingMore}
      fetchError={fetchError}
      clearError={() => setFetchError(null)}
      resetKey={isLoaded}
    >
      <ChatsSidebarGroupView
        conversations={conversations}
        pathname={pathname}
        deletingId={deletingId}
        editingId={editingId}
        editValue={editValue}
        showSupport={showSupport}
        onDelete={handleDelete}
        onEditStart={handleEditStart}
        onEditChange={setEditValue}
        onEditSave={handleEditSave}
        onEditCancel={handleEditCancel}
      />
    </InfiniteScroll>
  )
}
