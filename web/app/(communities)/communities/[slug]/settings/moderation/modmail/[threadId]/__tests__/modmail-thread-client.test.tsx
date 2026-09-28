import {
  makeMessage,
  makeThread,
  mockGetModmailMessagesClient,
  mockSendModmailMessage,
} from '@/test-helpers/app/communities/modmail-thread-client.mock-support'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModmailThreadClient } from '../modmail-thread-client'

describe('ModmailThreadClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders thread view with no messages', () => {
    render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(screen.getByText('No messages yet.')).toBeDefined()
  })

  it('renders modmail-thread-view data-pw attribute', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(container.querySelector('[data-pw="modmail-thread-view"]')).not.toBeNull()
  })

  it('renders existing messages', () => {
    render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[makeMessage('msg-1')]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod={false}
      />,
    )
    expect(screen.getByText('Message msg-1')).toBeDefined()
  })

  it('shows resolve button for mods on open threads', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(container.querySelector('[data-pw="modmail-resolve-button"]')).not.toBeNull()
  })

  it('hides resolve button for non-mods', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod={false}
      />,
    )
    expect(container.querySelector('[data-pw="modmail-resolve-button"]')).toBeNull()
  })

  it('hides resolve button and compose form when thread is resolved', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread({ resolved_at: '2026-01-01T00:00:00Z' })}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(container.querySelector('[data-pw="modmail-resolve-button"]')).toBeNull()
    expect(container.querySelector('[data-pw="modmail-compose-input"]')).toBeNull()
  })

  it('calls sendModmailMessage on form submit', async () => {
    mockSendModmailMessage.mockResolvedValueOnce({ message: makeMessage('new-msg') })
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )

    const textarea = container.querySelector(
      '[data-pw="modmail-compose-input"]',
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hello there' } })

    const form = textarea.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockSendModmailMessage).toHaveBeenCalledWith(
        'test-community',
        'thread-1',
        'Hello there',
      )
    })
  })

  it('shows load more button when initialHasMore is true', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore
        initialEndCursor='cursor-1'
        isMod
      />,
    )
    expect(container.querySelector('[data-pw="modmail-thread-load-more"]')).not.toBeNull()
  })

  it('calls getModmailMessagesClient on load more click', async () => {
    mockGetModmailMessagesClient.mockResolvedValueOnce({
      results: [makeMessage('older-msg')],
      page_info: { has_next_page: false, end_cursor: null },
    })

    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[makeMessage('msg-1')]}
        initialHasMore
        initialEndCursor='cursor-1'
        isMod
      />,
    )

    const loadMoreBtn = container.querySelector(
      '[data-pw="modmail-thread-load-more"]',
    ) as HTMLButtonElement
    fireEvent.click(loadMoreBtn)

    await waitFor(() => {
      expect(mockGetModmailMessagesClient).toHaveBeenCalledWith('test-community', 'thread-1', {
        after: 'cursor-1',
      })
    })
  })
})
