/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi, type Mock } from 'vitest'

type QueueToggleSectionOptions = {
  queueName: string
  productLabel: string
  renderSection: () => ReturnType<typeof render>
  fetchQueues: Mock
  pauseQueue: Mock
  resumeQueue: Mock
  toast: { success: Mock; error: Mock }
}

export function registerQueueToggleTests(options: QueueToggleSectionOptions): void {
  const { queueName, productLabel, renderSection, fetchQueues, pauseQueue, resumeQueue, toast } =
    options
  const disableLabel = `Disable ${productLabel}`
  const enableLabel = `Enable ${productLabel}`

  function queueResponse(paused: boolean) {
    return {
      queues: [
        { name: queueName, waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, paused },
      ],
      total: 1,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchQueues.mockResolvedValue(queueResponse(false))
    pauseQueue.mockResolvedValue({ success: true })
    resumeQueue.mockResolvedValue({ success: true })
  })

  test('shows loading state and disabled button while queue state loads', () => {
    fetchQueues.mockReturnValue(new Promise(() => undefined))
    renderSection()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  test('shows Enabled status and Disable button when queue is running', async () => {
    renderSection()
    expect(await screen.findByText('Enabled')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: disableLabel })
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()
  })

  test('shows Disabled status and Enable button when queue is paused', async () => {
    fetchQueues.mockResolvedValue(queueResponse(true))
    renderSection()
    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: enableLabel })
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()
  })

  test('stays in loading state when the queue is absent from the list', async () => {
    fetchQueues.mockResolvedValue({ queues: [], total: 0 })
    renderSection()
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  test('shows retry button when fetchQueues fails', async () => {
    fetchQueues.mockRejectedValueOnce(new Error('API unavailable'))
    renderSection()
    expect(await screen.findByRole('button', { name: 'Retry loading status' })).toBeInTheDocument()
  })

  test('retries fetchQueues when retry button is clicked', async () => {
    fetchQueues.mockRejectedValueOnce(new Error('API unavailable'))
    renderSection()
    await screen.findByRole('button', { name: 'Retry loading status' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading status' }))
    expect(await screen.findByText('Enabled')).toBeInTheDocument()
    expect(fetchQueues).toHaveBeenCalledTimes(2)
  })

  test('clicking Disable calls pauseQueue and shows success toast', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: disableLabel }))
    await waitFor(() => {
      expect(pauseQueue).toHaveBeenCalledWith(queueName)
      expect(toast.success).toHaveBeenCalledWith(`${productLabel} disabled`)
    })
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: enableLabel })).toBeInTheDocument()
  })

  test('clicking Enable calls resumeQueue and shows success toast', async () => {
    fetchQueues.mockResolvedValue(queueResponse(true))
    renderSection()
    await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: enableLabel }))
    await waitFor(() => {
      expect(resumeQueue).toHaveBeenCalledWith(queueName)
      expect(toast.success).toHaveBeenCalledWith(`${productLabel} enabled`)
    })
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: disableLabel })).toBeInTheDocument()
  })

  test('shows error toast and preserves state when pauseQueue fails', async () => {
    pauseQueue.mockRejectedValueOnce(new Error('Network error'))
    renderSection()
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: disableLabel }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(`Failed to toggle ${productLabel}`)
    })
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  test('shows error toast and preserves state when resumeQueue fails', async () => {
    fetchQueues.mockResolvedValue(queueResponse(true))
    resumeQueue.mockRejectedValueOnce(new Error('Network error'))
    renderSection()
    await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: enableLabel }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(`Failed to toggle ${productLabel}`)
    })
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  test('disables button while toggle action is in progress', async () => {
    let resolvePause!: () => void
    pauseQueue.mockReturnValueOnce(
      new Promise<{ success: boolean }>(resolve => {
        resolvePause = () => resolve({ success: true })
      }),
    )
    renderSection()
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: disableLabel }))
    expect(screen.getByRole('button')).toBeDisabled()
    await act(async () => {
      resolvePause()
    })
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
  })
}
