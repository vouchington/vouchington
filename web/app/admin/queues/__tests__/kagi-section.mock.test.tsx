import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KagiSection } from '../kagi-section'

import { fetchQueues, pauseQueue, resumeQueue } from '@/lib/api/client/mq'

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

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
  fetchQueues: vi.fn<VitestLooseMock>(),
  pauseQueue: vi.fn<VitestLooseMock>(),
  resumeQueue: vi.fn<VitestLooseMock>(),
}))

const mockFetchQueues = vi.mocked(fetchQueues)
const mockPauseQueue = vi.mocked(pauseQueue)
const mockResumeQueue = vi.mocked(resumeQueue)

function makeQueueResponse(paused: boolean) {
  return {
    queues: [{ name: 'kagi-smallweb', waiting: 0, active: 0, completed: 0, failed: 0, paused }],
    total: 1,
  }
}

describe('KagiSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchQueues.mockResolvedValue(makeQueueResponse(false))
    mockPauseQueue.mockResolvedValue({ success: true })
    mockResumeQueue.mockResolvedValue({ success: true })
  })

  it('shows loading state and disabled button while queue state loads', () => {
    mockFetchQueues.mockReturnValue(new Promise(() => undefined))
    render(<KagiSection />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows Enabled status and Disable button when queue is running', async () => {
    render(<KagiSection />)
    expect(await screen.findByText('Enabled')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Disable Kagi Smallweb' })
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()
  })

  it('shows Disabled status and Enable button when queue is paused', async () => {
    mockFetchQueues.mockResolvedValue(makeQueueResponse(true))
    render(<KagiSection />)
    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Enable Kagi Smallweb' })
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()
  })

  it('stays in loading state when kagi-smallweb queue is absent from list', async () => {
    mockFetchQueues.mockResolvedValue({ queues: [], total: 0 })
    render(<KagiSection />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows retry button when fetchQueues fails', async () => {
    mockFetchQueues.mockRejectedValueOnce(new Error('API unavailable'))
    render(<KagiSection />)
    expect(await screen.findByRole('button', { name: 'Retry loading status' })).toBeInTheDocument()
  })

  it('retries fetchQueues when retry button is clicked', async () => {
    mockFetchQueues.mockRejectedValueOnce(new Error('API unavailable'))
    render(<KagiSection />)
    await screen.findByRole('button', { name: 'Retry loading status' })

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading status' }))

    expect(await screen.findByText('Enabled')).toBeInTheDocument()
    expect(mockFetchQueues).toHaveBeenCalledTimes(2)
  })

  it('clicking Disable calls pauseQueue and shows success toast', async () => {
    render(<KagiSection />)
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Disable Kagi Smallweb' }))

    await waitFor(() => {
      expect(mockPauseQueue).toHaveBeenCalledWith('kagi-smallweb')
      expect(toastMock.success).toHaveBeenCalledWith('Kagi Smallweb disabled')
    })
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable Kagi Smallweb' })).toBeInTheDocument()
  })

  it('clicking Enable calls resumeQueue and shows success toast', async () => {
    mockFetchQueues.mockResolvedValue(makeQueueResponse(true))
    render(<KagiSection />)
    await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Enable Kagi Smallweb' }))

    await waitFor(() => {
      expect(mockResumeQueue).toHaveBeenCalledWith('kagi-smallweb')
      expect(toastMock.success).toHaveBeenCalledWith('Kagi Smallweb enabled')
    })
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disable Kagi Smallweb' })).toBeInTheDocument()
  })

  it('shows error toast and preserves state when pauseQueue fails', async () => {
    mockPauseQueue.mockRejectedValueOnce(new Error('Network error'))
    render(<KagiSection />)
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Disable Kagi Smallweb' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to toggle Kagi Smallweb')
    })
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  it('shows error toast and preserves state when resumeQueue fails', async () => {
    mockFetchQueues.mockResolvedValue(makeQueueResponse(true))
    mockResumeQueue.mockRejectedValueOnce(new Error('Network error'))
    render(<KagiSection />)
    await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Enable Kagi Smallweb' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to toggle Kagi Smallweb')
    })
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('disables button while toggle action is in progress', async () => {
    let resolvePause!: () => void
    mockPauseQueue.mockReturnValueOnce(
      new Promise<{ success: boolean }>(res => (resolvePause = () => res({ success: true }))),
    )

    render(<KagiSection />)
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Disable Kagi Smallweb' }))

    expect(screen.getByRole('button')).toBeDisabled()

    await act(async () => {
      resolvePause()
    })
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
  })
})
