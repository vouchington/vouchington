import { describe, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AiAgentsSection } from '../ai-agents-section'
import { fetchQueues, pauseQueue, resumeQueue } from '@/lib/api/client/mq'
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
  fetchQueues: vi.fn<VitestLooseMock>(),
  pauseQueue: vi.fn<VitestLooseMock>(),
  resumeQueue: vi.fn<VitestLooseMock>(),
}))

describe('AiAgentsSection', () => {
  registerQueueToggleTests({
    queueName: 'ai_agents',
    productLabel: 'AI Agents',
    renderSection: () => render(<AiAgentsSection />),
    fetchQueues: vi.mocked(fetchQueues),
    pauseQueue: vi.mocked(pauseQueue),
    resumeQueue: vi.mocked(resumeQueue),
    toast: toastMock,
  })
})
