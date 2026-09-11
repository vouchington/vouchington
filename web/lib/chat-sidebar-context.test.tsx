import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatSidebarProvider } from './chat-sidebar-context'
import { useChatSidebar } from './use-chat-sidebar'
import type { ChatConversation } from '@/types/chat'

function makeConversation(id: string, title: string): ChatConversation {
  return {
    id,
    title,
    created_at: '',
    created_by_id: 'user-1',
    updated_at: '',
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
  }
}

const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }

describe('ChatSidebarProvider', () => {
  it('replaces the first page and marks sidebar data loaded', () => {
    let context: ReturnType<typeof useChatSidebar> | null = null
    render(
      <ChatSidebarProvider>
        <CaptureContext onContext={value => (context = value)} />
      </ChatSidebarProvider>,
    )

    act(() => {
      context!.replaceFirstPage([makeConversation('conv-1', 'First')], pageInfo)
    })

    expect(context!.isLoaded).toBe(true)
    expect(context!.conversations.map(conversation => conversation.title)).toEqual(['First'])
  })

  it('appends and prepends conversations without duplicates', () => {
    let context: ReturnType<typeof useChatSidebar> | null = null
    render(
      <ChatSidebarProvider>
        <CaptureContext onContext={value => (context = value)} />
      </ChatSidebarProvider>,
    )

    act(() => {
      context!.replaceFirstPage([makeConversation('conv-1', 'First')], {
        has_next_page: true,
        end_cursor: 'conv-1',
        start_cursor: 'conv-1',
      })
      context!.appendPage(
        [makeConversation('conv-1', 'First duplicate'), makeConversation('conv-2', 'Second')],
        pageInfo,
      )
      context!.prependConversation(makeConversation('conv-2', 'Second duplicate'))
      context!.prependConversation(makeConversation('conv-3', 'Newest'))
    })

    expect(context!.conversations.map(conversation => conversation.title)).toEqual([
      'Newest',
      'Second duplicate',
      'First',
    ])
  })

  it('keeps prepended conversations while waiting for server data', () => {
    let context: ReturnType<typeof useChatSidebar> | null = null
    render(
      <ChatSidebarProvider>
        <CaptureContext onContext={value => (context = value)} />
      </ChatSidebarProvider>,
    )

    act(() => {
      context!.prependConversation(makeConversation('conv-new', 'New chat'))
      context!.prependConversation(makeConversation('conv-stale', 'Stale local chat'))
    })

    expect(context!.isLoaded).toBe(false)

    act(() => {
      context!.replaceFirstPage(
        [
          makeConversation('conv-stale', 'Fresh server chat'),
          makeConversation('conv-old', 'Older server chat'),
        ],
        pageInfo,
      )
    })

    expect(context!.isLoaded).toBe(true)
    expect(context!.conversations.map(conversation => conversation.title)).toEqual([
      'New chat',
      'Fresh server chat',
      'Older server chat',
    ])
  })

  it('removes a conversation by id', () => {
    let context: ReturnType<typeof useChatSidebar> | null = null
    render(
      <ChatSidebarProvider>
        <CaptureContext onContext={value => (context = value)} />
      </ChatSidebarProvider>,
    )

    act(() => {
      context!.replaceFirstPage(
        [makeConversation('conv-1', 'First'), makeConversation('conv-2', 'Second')],
        pageInfo,
      )
      context!.removeConversation('conv-1')
    })

    expect(context!.conversations.map(conversation => conversation.id)).toEqual(['conv-2'])
  })
})

function CaptureContext({
  onContext,
}: {
  onContext: (context: ReturnType<typeof useChatSidebar>) => void
}) {
  onContext(useChatSidebar())
  return null
}
