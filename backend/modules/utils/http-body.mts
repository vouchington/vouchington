import { HttpNoBodyError, HttpResponseSizeError } from '@modules/on-error/errors'
import onError from '@modules/on-error'
import type { Response as UndiciResponse } from 'undici'
import {
  MissingResponseBodyError,
  readResponseBodyAsBuffer as readBoundedResponseBody,
  ResponseBodyTooLargeError,
  type ReadResponseBodyOptions as BoundedReadResponseBodyOptions,
} from '@vouchington/utils/http-body'

export type ReadResponseBodyOptions = Omit<BoundedReadResponseBodyOptions, 'response'> & {
  readonly response: Pick<Response, 'body'> | Pick<UndiciResponse, 'body'>
}

/* no-mistakes: integration=http */
export const readResponseBodyAsBuffer = async (
  options: ReadResponseBodyOptions,
): Promise<Buffer> => {
  try {
    return await readBoundedResponseBody({
      ...options,
      response: responseWithCompatibleBody(options.response, options.signal),
    })
  } catch (error) {
    if (error instanceof MissingResponseBodyError) throw new HttpNoBodyError(error.url)
    if (error instanceof ResponseBodyTooLargeError) {
      throw new HttpResponseSizeError(error.url, error.sizeBytes, error.maxSizeBytes)
    }
    throw error
  }
}

export const readResponseBody = async (options: ReadResponseBodyOptions): Promise<string> => {
  const buffer = await readResponseBodyAsBuffer(options)
  return buffer.toString('utf-8')
}

function responseWithCompatibleBody(
  response: ReadResponseBodyOptions['response'],
  signal?: AbortSignal,
): Response {
  if (response instanceof Response) return response
  if (!response.body) return new Response()
  const reader = response.body.getReader()
  let released = false
  let abortListener: (() => void) | undefined

  function release(): void {
    if (released) return
    released = true
    if (signal && abortListener) signal.removeEventListener('abort', abortListener)
    reader.releaseLock()
  }

  function cancel(reason: unknown): Promise<void> {
    return reader.cancel(reason).catch(onError).finally(release)
  }

  if (signal) {
    abortListener = () => {
      void cancel(signal.reason)
    }
    if (signal.aborted) abortListener()
    else signal.addEventListener('abort', abortListener, { once: true })
  }

  return new Response(
    new ReadableStream({
      async pull(controller) {
        try {
          const result = await reader.read()
          if (result.done) {
            release()
            controller.close()
          } else {
            controller.enqueue(result.value)
          }
        } catch (error) {
          release()
          controller.error(error)
        }
      },
      async cancel(reason) {
        await cancel(reason)
      },
    }),
  )
}
