import { describe, expect, it, vi } from 'vitest'
import { HttpResponseSizeError } from '@vouchington/sentry'
import { writeResponseToTemporaryFile } from '../response-file.mts'

describe('writeResponseToTemporaryFile', () => {
  it('does not cancel a response body that reaches normal EOF', async () => {
    const cancel = vi.fn<VitestLooseMock>()
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array(4))
        controller.close()
      },
    })

    const file = await writeResponseToTemporaryFile(new Response(body), 'https://example.test/', 4)
    await file.cleanup()

    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels the response body when the size limit aborts spooling', async () => {
    const cancel = vi.fn<VitestLooseMock>()
    const body = new ReadableStream<Uint8Array>({
      cancel,
      pull(controller) {
        controller.enqueue(new Uint8Array(8))
      },
    })

    await expect(
      writeResponseToTemporaryFile(new Response(body), 'https://example.test/', 4),
    ).rejects.toBeInstanceOf(HttpResponseSizeError)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('preserves the size error and unlocks the body when cancellation rejects', async () => {
    const cancel = vi.fn<VitestLooseMock>(() => Promise.reject(new Error('cancel failed')))
    const body = new ReadableStream<Uint8Array>({
      cancel,
      pull(controller) {
        controller.enqueue(new Uint8Array(8))
      },
    })

    await expect(
      writeResponseToTemporaryFile(new Response(body), 'https://example.test/', 4),
    ).rejects.toBeInstanceOf(HttpResponseSizeError)
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('destroys the readable when reader cleanup fails after EOF', async () => {
    const releaseLock = vi.fn<() => void>(() => {
      throw new Error('release failed')
    })
    const body = {
      getReader: () => ({
        read: async () => ({ done: true as const, value: undefined }),
        releaseLock,
        cancel: async () => undefined,
      }),
    } as unknown as ReadableStream<Uint8Array>

    await expect(
      writeResponseToTemporaryFile({ body } as Response, 'https://example.test/', 100),
    ).rejects.toThrow('release failed')
    expect(releaseLock).toHaveBeenCalledOnce()
  })
})
