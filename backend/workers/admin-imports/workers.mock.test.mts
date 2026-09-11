import { describe, expect, it, type Mock, vi } from 'vitest'
import { Worker } from 'glide-mq'

const mockWorker = vi.hoisted(
  () =>
    vi.fn<typeof import('glide-mq').Worker>() as Mock<typeof import('glide-mq').Worker> &
      typeof import('glide-mq').Worker,
)

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => ({
  Worker: mockWorker,
}))

describe('adminImports worker registration', () => {
  it('registers the admin-imports worker', async () => {
    await import('./workers.mts')

    expect(Worker).toHaveBeenCalledWith(
      'admin-imports',
      expect.any(Function),
      expect.objectContaining({
        concurrency: expect.any(Number),
      }),
    )
  })
})
