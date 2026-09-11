import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ScheduledJobsErrorAlert,
  ScheduledJobsErrorState,
  ScheduledJobsLoadingState,
} from './scheduled-jobs-load-state'

describe('scheduled jobs load states', () => {
  it('renders the full-page loading state', () => {
    const { container } = render(<ScheduledJobsLoadingState />)

    expect(screen.getByRole('heading', { level: 1, name: 'Queues' })).toHaveClass('sr-only')
    expect(screen.getByText('Loading scheduled jobs...')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass(
      'flex',
      'min-h-screen',
      'items-center',
      'justify-center',
    )
  })

  it('renders the reusable error alert with an optional title', () => {
    render(
      <ScheduledJobsErrorAlert
        error='API unavailable'
        title='Error Loading Scheduled Jobs'
      />,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'Error Loading Scheduled Jobs' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('API unavailable')).toBeInTheDocument()
  })

  it('renders the full-page error state with the same centered shell as loading', () => {
    const { container } = render(<ScheduledJobsErrorState error='Queue API timed out' />)

    expect(screen.getByRole('heading', { level: 1, name: 'Queues' })).toHaveClass('sr-only')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Error Loading Scheduled Jobs' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Queue API timed out')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass(
      'flex',
      'min-h-screen',
      'items-center',
      'justify-center',
    )
  })
})
