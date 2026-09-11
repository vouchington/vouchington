import { describe, expect, it, vi } from 'vitest'
import { HttpResponseSizeError } from '@modules/on-error/errors'
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
})
