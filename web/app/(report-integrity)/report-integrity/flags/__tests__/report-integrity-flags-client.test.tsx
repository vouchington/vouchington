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

  it('renders a post_id entity link', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ post_id: 'post-uuid-1234' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText(/Post\/Comment: post-uui/)).toBeInTheDocument()
  })

  it('renders a reported_user_id entity link', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ reported_user_id: 'user-uuid-5678' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByRole('link', { name: /User: user-uui/ })).toHaveAttribute(
      'href',
      '/user/user-uuid-5678/admin',
    )
  })

  it('renders a hostname_id entity link', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ hostname_id: 'hostname-abcdefgh' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText(/Hostname: hostname/)).toBeInTheDocument()
  })

  it('renders an rss_feed_item_id entity link', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ rss_feed_item_id: 'rss-item-xyz123' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText(/RSS Item: rss-item/)).toBeInTheDocument()
  })

  it('renders unknown entity link when no entity id is set', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag()])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
