import {
  makeThread,
  mockGetModmailMessagesClient,
  mockOnError,
  mockResolveModmailThread,
  mockSendModmailMessage,
} from '@/test-helpers/app/communities/modmail-thread-client.mock-support'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModmailMessage } from '@/lib/api/client/modmail'
import { ModmailThreadClient } from '../modmail-thread-client'

describe('ModmailThreadClient — actions and error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('calls resolveModmailThread when resolve button is clicked', async () => {
    mockResolveModmailThread.mockResolvedValueOnce({
      thread: makeThread({ resolved_at: '2026-01-02T00:00:00Z' }),
    })

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

    const resolveBtn = container.querySelector(
      '[data-pw="modmail-resolve-button"]',
    ) as HTMLButtonElement
    fireEvent.click(resolveBtn)

    await waitFor(() => {
      expect(mockResolveModmailThread).toHaveBeenCalledWith('test-community', 'thread-1')
    })
  })

  it('displays subject_user_id and assigned_mod_id when set', () => {
    render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread({ subject_user_id: 'subject-user', assigned_mod_id: 'mod-user' })}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(screen.getByText('Member: subject-user')).toBeDefined()
    expect(screen.getByText('Assigned to: mod-user')).toBeDefined()
  })

  it('renders message with null created_by_id as System', () => {
    const msg: ModmailMessage = {
      id: 'sys-msg',
      conversation_id: 'thread-1',
      body_text: 'System message',
      created_by_id: null,
      created_at: '2026-01-01T00:00:00Z',
    }
    render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[msg]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod={false}
      />,
    )
    expect(screen.getByText('Member')).toBeDefined()
  })

  it('calls onError when getModmailMessagesClient fails', async () => {
    const err = new Error('load error')
    mockGetModmailMessagesClient.mockRejectedValueOnce(err)

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

    const loadMoreBtn = container.querySelector(
      '[data-pw="modmail-thread-load-more"]',
    ) as HTMLButtonElement
    fireEvent.click(loadMoreBtn)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(err, {
        fallback: 'Failed to load more messages',
      })
    })
  })

  it('calls onError when sendModmailMessage fails', async () => {
    const err = new Error('send error')
    mockSendModmailMessage.mockRejectedValueOnce(err)

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
    fireEvent.change(textarea, { target: { value: 'Hello!' } })
    fireEvent.submit(textarea.closest('form')!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(err, { fallback: 'Failed to send message' })
    })
  })

  it('calls onError when resolveModmailThread fails', async () => {
    const err = new Error('resolve error')
    mockResolveModmailThread.mockRejectedValueOnce(err)

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

    const resolveBtn = container.querySelector(
      '[data-pw="modmail-resolve-button"]',
    ) as HTMLButtonElement
    fireEvent.click(resolveBtn)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(err, { fallback: 'Failed to resolve thread' })
    })
  })
})
