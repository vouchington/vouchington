import {
  makeFlag,
  makeInitialData,
  mockNav,
} from '@/test-helpers/app/report-integrity/report-integrity-flags-client.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ReportIntegrityFlagsClient } from '../report-integrity-flags-client'

describe('ReportIntegrityFlagsClient — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the flags heading', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Report Integrity Flags')).toBeInTheDocument()
  })

  it('updates the status selector immediately when changing filters', async () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='pending'
      />,
    )
    const selector = screen.getByText('Filter: pending').parentElement
    if (!selector) throw new Error('Expected selector container')
    await act(async () => {
      fireEvent.click(within(selector).getByRole('button', { name: 'set resolved' }))
    })
    expect(screen.getByText('Filter: resolved')).toBeInTheDocument()
    expect(mockNav.replace).toHaveBeenCalledWith('/report-integrity/flags?status=resolved')
  })

  it('appends status=all for all filter', async () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='resolved'
      />,
    )
    const selector = screen.getByText('Filter: resolved').parentElement
    if (!selector) throw new Error('Expected selector container')
    await act(async () => {
      fireEvent.click(within(selector).getByRole('button', { name: 'set all' }))
    })
    expect(mockNav.replace).toHaveBeenCalledWith('/report-integrity/flags?status=all')
  })

  it('shows empty state for pending with no flags', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText(/No pending flags found/)).toBeInTheDocument()
  })

  it('shows empty state without status word for "all" filter', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='all'
      />,
    )
    expect(screen.getByText(/No flags found/)).toBeInTheDocument()
  })

  it('renders a post label without exposing its id', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({ post_id: 'post-uuid-1234', entity_label: 'A reported post' }),
        ])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('A reported post')).toBeInTheDocument()
    expect(screen.queryByText(/post-uuid-1234/)).not.toBeInTheDocument()
  })

  it('links a reported user by username and displays the label', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({
            reported_user_id: 'user-uuid-5678',
            reported_username: 'reported-user',
            entity_label: 'Reported User',
          }),
        ])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByRole('link', { name: 'Reported User' })).toHaveAttribute(
      'href',
      '/user/reported-user/admin',
    )
    expect(screen.queryByText(/user-uuid-5678/)).not.toBeInTheDocument()
  })

  it('links a hostname flag by its hostname', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({
            hostname_id: 'hostname-abcdefgh',
            hostname: 'flags.example.com',
            entity_label: 'flags.example.com',
          }),
        ])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByRole('link', { name: 'flags.example.com' })).toHaveAttribute(
      'href',
      '/domain/flags.example.com',
    )
  })

  it('renders an RSS item label without exposing its id', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({ rss_feed_item_id: 'rss-item-xyz123', entity_label: 'Feed headline' }),
        ])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Feed headline')).toBeInTheDocument()
    expect(screen.queryByText(/rss-item-xyz123/)).not.toBeInTheDocument()
  })

  it('renders the server label when no entity id is set', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ entity_label: 'Unknown' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
