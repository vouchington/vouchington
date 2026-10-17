import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { KagiSection } from '../kagi-section'
import { QueueDomainsSection } from '../queue-domains-section'
import { fetchQueueDomains, pauseQueueDomain, resumeQueueDomain } from '@/lib/api/client/mq'

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => options.fallback,
  onSuccess: () => undefined,
}))

vi.mock(import('@/lib/api/client/mq'), () => ({
  fetchQueueDomains: vi.fn<VitestLooseMock>(),
  pauseQueueDomain: vi.fn<VitestLooseMock>(),
  resumeQueueDomain: vi.fn<VitestLooseMock>(),
  retryFailedDomainJobs: vi.fn<VitestLooseMock>(),
}))

const done = { count: 0, complete: true }

// One shared server-side flag, as the real API: both controls read and write the same domain.
let serverPaused = false

function renderBothControls() {
  render(
    <>
      <KagiSection />
      <QueueDomainsSection />
    </>,
  )
}

describe('the Kagi toggle and the domains table control the same domain', () => {
  beforeEach(() => {
    serverPaused = false
    vi.mocked(fetchQueueDomains).mockImplementation(async () => ({
      domains: [
        {
          domain: 'kagi-smallweb',
          paused: serverPaused,
          paused_at: null,
          paused_by: null,
          reason: null,
          waiting: done,
          active: done,
          delayed: done,
          completed: done,
          failed: done,
        },
      ],
    }))
    vi.mocked(pauseQueueDomain).mockImplementation(async () => {
      serverPaused = true
      return { success: true }
    })
    vi.mocked(resumeQueueDomain).mockImplementation(async () => {
      serverPaused = false
      return { success: true }
    })
  })

  it('shows a pause made in the table on the Kagi toggle', async () => {
    renderBothControls()
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))

    expect(await screen.findByRole('button', { name: 'Enable Kagi Smallweb' })).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('shows a pause made on the Kagi toggle in the table, and a resume the other way', async () => {
    renderBothControls()
    fireEvent.click(await screen.findByRole('button', { name: 'Disable Kagi Smallweb' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
    expect(await screen.findByRole('button', { name: 'Disable Kagi Smallweb' })).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })
})
