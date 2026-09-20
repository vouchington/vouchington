import { describe, expect, it, vi } from 'vitest'
import { enqueueOrRetryCopyrightFormScreening } from './copyright-form-screening.mts'

describe('copyright form screening enqueue recovery', () => {
  it('removes a completed job before recovering its missing result', async () => {
    const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightFormScreening('submission-id', {
      getJob: vi.fn().mockResolvedValue({
        name: 'copyright-form-screening',
        getState: async () => 'completed',
        remove,
        retry: async () => undefined,
      }),
      enqueue,
    })

    expect(remove).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith('submission-id')
  })
})
