import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueueDomainsSection } from '../queue-domains-section'
import {
  fetchQueueDomains,
  pauseQueueDomain,
  resumeQueueDomain,
  retryFailedDomainJobs,
  type QueueDomain,
} from '@/lib/api/client/mq'

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

vi.mock(import('@/lib/api/client/mq'), () => ({
  fetchQueueDomains: vi.fn<VitestLooseMock>(),
  pauseQueueDomain: vi.fn<VitestLooseMock>(),
  resumeQueueDomain: vi.fn<VitestLooseMock>(),
  retryFailedDomainJobs: vi.fn<VitestLooseMock>(),
}))

const mockFetch = vi.mocked(fetchQueueDomains)
const mockPause = vi.mocked(pauseQueueDomain)
const mockResume = vi.mocked(resumeQueueDomain)
const mockRetry = vi.mocked(retryFailedDomainJobs)

const done = (count: number) => ({ count, complete: true })

function makeDomain(overrides: Partial<QueueDomain>): QueueDomain {
  return {
    domain: 'ses-inbound',
    paused: false,
    paused_at: null,
    paused_by: null,
    reason: null,
    waiting: done(1),
    active: done(2),
    delayed: done(3),
    completed: done(4),
    failed: done(5),
    ...overrides,
  }
}

const running = makeDomain({ waiting: { count: 1200, complete: false } })
const paused = makeDomain({
  domain: 'openai-moderation',
  paused: true,
  reason: 'provider outage',
})

// A refresh returning this marker count proves the section re-fetched and re-rendered.
function refreshWithMarker() {
  mockFetch.mockResolvedValueOnce({ domains: [running, paused] })
  mockFetch.mockResolvedValueOnce({
    domains: [makeDomain({ waiting: done(777) }), paused],
  })
}

describe('QueueDomainsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ domains: [running, paused] })
    mockPause.mockResolvedValue({ success: true })
    mockResume.mockResolvedValue({ success: true })
    mockRetry.mockResolvedValue({ success: true, retried: 7 })
  })

  it('shows loading until the domains arrive', () => {
    mockFetch.mockReturnValue(new Promise(() => undefined))
    render(<QueueDomainsSection />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith('background')
  })

  it('renders exact and capped counts, status and reason', async () => {
    render(<QueueDomainsSection />)
    expect(await screen.findByText('ses-inbound')).toBeInTheDocument()
    expect(screen.getByText('1,200+')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Paused: provider outage')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Pause' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Resume' })).toHaveLength(1)
  })

  it('shows a bare Paused label when no reason is recorded', async () => {
    mockFetch.mockResolvedValue({ domains: [makeDomain({ paused: true })] })
    render(<QueueDomainsSection />)
    expect(await screen.findByText('Paused')).toBeInTheDocument()
  })

  it('pauses a running domain, toasts and refreshes', async () => {
    refreshWithMarker()
    render(<QueueDomainsSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    expect(await screen.findByText('777')).toBeInTheDocument()
    expect(mockPause).toHaveBeenCalledWith('background', 'ses-inbound')
    expect(toastMock.success).toHaveBeenCalledWith('ses-inbound paused')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('resumes a paused domain, toasts and refreshes', async () => {
    refreshWithMarker()
    render(<QueueDomainsSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
    await screen.findByText('777')
    expect(mockResume).toHaveBeenCalledWith('background', 'openai-moderation')
    expect(toastMock.success).toHaveBeenCalledWith('openai-moderation resumed')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('retries failed jobs for the clicked domain only', async () => {
    refreshWithMarker()
    render(<QueueDomainsSection />)
    const buttons = await screen.findAllByRole('button', { name: 'Retry failed' })
    fireEvent.click(buttons[1] as HTMLElement)
    await screen.findByText('777')
    expect(mockRetry).toHaveBeenCalledWith('background', 'openai-moderation')
    expect(toastMock.success).toHaveBeenCalledWith('Failed jobs retried in openai-moderation: 7')
  })

  it('disables the row actions while a request is in flight', async () => {
    mockPause.mockReturnValue(new Promise(() => undefined))
    render(<QueueDomainsSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    const retryButtons = screen.getAllByRole('button', { name: 'Retry failed' })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(retryButtons[0]).toBeDisabled()
    expect(retryButtons[1]).toBeEnabled()
  })

  it('reports a failed action with the domain-specific message', async () => {
    mockResume.mockRejectedValue(new Error('boom'))
    refreshWithMarker()
    render(<QueueDomainsSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
    await screen.findByText('777')
    expect(toastMock.error).toHaveBeenCalledWith('Failed to resume openai-moderation')
  })

  it.each([
    ['pause', 'Pause', mockPause, 'Failed to pause ses-inbound'],
    ['retry', 'Retry failed', mockRetry, 'Failed to retry failed jobs in ses-inbound'],
  ] as const)('reports a failed %s', async (_name, label, mock, message) => {
    mock.mockRejectedValue(new Error('boom'))
    refreshWithMarker()
    render(<QueueDomainsSection />)
    const [button] = await screen.findAllByRole('button', { name: label })
    fireEvent.click(button as HTMLElement)
    await screen.findByText('777')
    expect(toastMock.error).toHaveBeenCalledWith(message)
  })

  it('shows a retry control when loading fails and reloads on click', async () => {
    mockFetch.mockRejectedValueOnce(new Error('unavailable'))
    render(<QueueDomainsSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('ses-inbound')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
