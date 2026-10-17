import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { KagiSection } from '../kagi-section'
import { QueueDomainsSection } from '../queue-domains-section'
import { notifyDomainsChanged } from '../domains-sync'
import { fetchQueueDomains } from '@/lib/api/client/mq'

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

function response(paused: boolean) {
  return {
    domains: [
      {
        domain: 'kagi-smallweb',
        paused,
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
  }
}

function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void
  const promise = new Promise<ReturnType<typeof response>>(res => {
    resolve = res
  })
  return { promise, resolve }
}

describe('an older domain load finishing late does not overwrite a newer one', () => {
  const older = deferred()
  const newer = deferred()

  beforeEach(() => {
    // The two mount loads stay pending while another control's change triggers the two reloads.
    vi.mocked(fetchQueueDomains)
      .mockReset()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
      .mockReturnValueOnce(newer.promise)
  })

  it('keeps the Kagi toggle and the table on the newer paused state', async () => {
    render(
      <>
        <KagiSection />
        <QueueDomainsSection />
      </>,
    )
    act(() => {
      notifyDomainsChanged()
    })
    await act(async () => {
      newer.resolve(response(true))
      await newer.promise
    })
    await act(async () => {
      older.resolve(response(false))
      await older.promise
    })

    expect(await screen.findByRole('button', { name: 'Enable Kagi Smallweb' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('recovers from a failed load when a later reload succeeds', async () => {
    vi.mocked(fetchQueueDomains)
      .mockReset()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(response(false))
    render(
      <>
        <KagiSection />
        <QueueDomainsSection />
      </>,
    )
    await screen.findAllByRole('button', { name: 'Retry' })

    act(() => {
      notifyDomainsChanged()
    })

    expect(await screen.findByRole('button', { name: 'Disable Kagi Smallweb' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
