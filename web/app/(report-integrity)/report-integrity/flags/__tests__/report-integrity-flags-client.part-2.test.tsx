import {
  makeFlag,
  makeInitialData,
} from '@/test-helpers/app/report-integrity/report-integrity-flags-client.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportIntegrityFlagsClient } from '../report-integrity-flags-client'

describe('ReportIntegrityFlagsClient — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders reporter count and new account percentage', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({ reporter_count: 12, new_account_reporter_pct: 0.75 }),
        ])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('75.0%')).toBeInTheDocument()
  })

  it('shows pending status badge for unresolved flag', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ resolved_at: null })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('shows dismissed resolution badge for resolved flag', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({
            resolved_at: '2024-01-02T00:00:00Z',
            resolved_by_id: 'a',
            resolution: 'dismissed',
          }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getByText('Dismissed')).toBeInTheDocument()
  })

  it('shows penalized resolution badge for resolved flag', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({
            resolved_at: '2024-01-02T00:00:00Z',
            resolved_by_id: 'a',
            resolution: 'penalized',
          }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getByText('Penalized')).toBeInTheDocument()
  })

  it('shows resolved fallback text when resolution is null', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({ resolved_at: '2024-01-02T00:00:00Z', resolved_by_id: null, resolution: null }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getByText('resolved')).toBeInTheDocument()
  })

  it('shows resolver id in actions for resolved flags', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({
            resolved_at: '2024-01-02T00:00:00Z',
            resolved_by_id: 'admin-abcdefgh-xyz',
            resolution: null,
          }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getByText(/by admin-abcdefgh-xyz/)).toBeInTheDocument()
  })

  it('shows the resolved timestamp when no resolver id is available', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([
          makeFlag({ resolved_at: '2024-01-02T00:00:00Z', resolved_by_id: null, resolution: null }),
        ])}
        initialStatus='resolved'
      />,
    )
    expect(screen.getAllByText('Jan 2, 2024').length).toBeGreaterThan(0)
  })

  it('renders table column headers', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData()}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Flag Type')).toBeInTheDocument()
    expect(screen.getByText('Target')).toBeInTheDocument()
    expect(screen.getByText('Reporters')).toBeInTheDocument()
    expect(screen.getByText('New Account %')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('renders the localized known flag reason', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={makeInitialData([makeFlag({ flag_type: 'mass_report_suspected' })])}
        initialStatus='pending'
      />,
    )
    expect(screen.getByText('Suspected mass report abuse')).toBeInTheDocument()
  })
})
