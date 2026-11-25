import { HttpNoBodyError, HttpResponseSizeError } from '@vouchington/sentry'
import { withAbortableBody, type ResponseWithBody } from '@vouchington/http-transport/fetch'
import {
  MissingResponseBodyError,
  readResponseBodyAsBuffer as readBoundedResponseBody,
  ResponseBodyTooLargeError,
  type ReadResponseBodyOptions as BoundedReadResponseBodyOptions,
} from '@vouchington/utils/http-body'
import { reportHttpTransportError } from './http.mts'

export type ReadResponseBodyOptions = Omit<BoundedReadResponseBodyOptions, 'response'> & {
  readonly response: ResponseWithBody
}

/* no-mistakes: integration=http */
export const readResponseBodyAsBuffer = async (
  options: ReadResponseBodyOptions,
): Promise<Buffer> => {
  try {
    return await readBoundedResponseBody({
      ...options,
      response: withAbortableBody(options.response, options.signal, {
        onError: reportHttpTransportError,
      }),
    })
  } catch (err) {
    if (err instanceof MissingResponseBodyError) throw new HttpNoBodyError(err.url)
    if (err instanceof ResponseBodyTooLargeError) {
      throw new HttpResponseSizeError(err.url, err.sizeBytes, err.maxSizeBytes)
    }
    throw err
  }
}

export const readResponseBody = async (options: ReadResponseBodyOptions): Promise<string> => {
  const buffer = await readResponseBodyAsBuffer(options)
  return buffer.toString('utf8')
}
