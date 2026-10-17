import { describe, vi } from 'vitest'
import { render } from '@testing-library/react'
import { KagiSection } from '../kagi-section'
import { fetchQueueDomains, pauseQueueDomain, resumeQueueDomain } from '@/lib/api/client/mq'
import { registerQueueToggleTests } from '@/test-helpers/admin/queue-toggle-section'

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
  fetchQueueDomains: vi.fn<VitestLooseMock>(),
  pauseQueueDomain: vi.fn<VitestLooseMock>(),
  resumeQueueDomain: vi.fn<VitestLooseMock>(),
}))

describe('KagiSection', () => {
  registerQueueToggleTests({
    queueName: 'background',
    domain: 'kagi-smallweb',
    productLabel: 'Kagi Smallweb',
    renderSection: () => render(<KagiSection />),
    fetchQueues: vi.mocked(fetchQueueDomains),
    pauseQueue: vi.mocked(pauseQueueDomain),
    resumeQueue: vi.mocked(resumeQueueDomain),
    toast: toastMock,
  })
})
