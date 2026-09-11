import type { MessageKey } from '@ts-shared/ui-messages'
import { ApiError } from './error'

export interface ParsedErrorDigest {
  status: number
  title: MessageKey
  description: MessageKey
}

const STATUS_COPY: Record<number, { title: MessageKey; description: MessageKey }> = {
  400: {
    title: 'extracted.api.errorHelpers.badRequest_917ef22f',
    description: 'extracted.api.errorHelpers.theRequestWasInvalidPleaseTry_ac456788',
  },
  408: {
    title: 'extracted.api.errorHelpers.requestTimeout_70f60044',
    description: 'extracted.api.errorHelpers.theRequestTimedOutPleaseTry_e5893a0d',
  },
  409: {
    title: 'extracted.api.errorHelpers.conflict_014659ab',
    description: 'extracted.api.errorHelpers.thereWasAConflictWithYour_d6e84337',
  },
  410: {
    title: 'extracted.api.errorHelpers.gone_55f6a88d',
    description: 'extracted.api.errorHelpers.thisResourceIsNoLongerAvailable_fe97b81d',
  },
  422: {
    title: 'extracted.api.errorHelpers.invalidInput_c9bbbe83',
    description: 'extracted.api.errorHelpers.theRequestDataIsInvalidPlease_f6cdb2d2',
  },
  429: {
    title: 'extracted.api.errorHelpers.tooManyRequests_802600d1',
    description: 'extracted.api.errorHelpers.youReSendingRequestsTooQuickly_bae67614',
  },
}

/**
 * Parses an error digest produced by `ApiError` to extract the HTTP status code
 * and user-facing copy. Returns `null` for unrecognized digests (e.g.
 * `NEXT_HTTP_ERROR_FALLBACK;404`, `undefined`, or plain `Error` messages).
 *
 * Only matches the `EXPECTED_CLIENT_ERROR;{status}` format written by `ApiError`
 * for non-401/403/404 4xx responses. Use this in `error.tsx` / `global-error.tsx`
 * to display status-specific messaging without access to the original error object.
 */
export function parseErrorDigest(digest: string | undefined): ParsedErrorDigest | null {
  const match = digest?.match(/^EXPECTED_CLIENT_ERROR;(\d+)$/)
  if (!match) return null
  const status = Number(match[1])
  const copy = STATUS_COPY[status] ?? {
    title: 'extracted.api.errorHelpers.somethingWentWrong_ab827e3f',
    description: 'extracted.api.errorHelpers.anErrorOccurredPleaseTryAgain_9c170dda',
  }
  return { status, ...copy }
}

/**
 * Returns the user-safe error message from an ApiError, or a fallback for other error types.
 *
 * ApiError.message contains backend `message` payloads. This also handles
 * `error` payloads and plain-text bodies returned by parseErrorResponseBody().
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (typeof error.data === 'string' && error.data.length > 0) return error.data
    if (error.data != null && typeof error.data === 'object') {
      if (
        'error' in error.data &&
        typeof error.data.error === 'string' &&
        error.data.error.length > 0
      ) {
        return error.data.error
      }
      if (
        'message' in error.data &&
        typeof error.data.message === 'string' &&
        error.data.message.length > 0
      ) {
        return error.data.message
      }
    }
    return error.message
  }
  return fallback
}

/**
 * Checks whether an error is an ApiError with a specific error code.
 *
 * Use this instead of matching on error.message strings, which may change.
 */
export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code
}

/**
 * Checks whether an error is a standing tag-add cap rejection (#8246), as opposed to a
 * transient failure `onError`'s generic fallback message should handle.
 */
export function isTagLimitError(error: unknown): boolean {
  return hasErrorCode(error, 'TAG_LIMIT_REACHED')
}

/**
 * Reads a non-OK fetch response body and returns the parsed JSON object when possible,
 * the raw text otherwise, or `null` if the body cannot be read at all.
 *
 * Shared by both `ClientRequest` and `ServerRequest` so the two sides parse error
 * payloads identically.
 */
export async function parseErrorResponseBody(response: Response): Promise<unknown> {
  const text = await readBoundedErrorText(response)
  if (text === null) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const MAX_ERROR_RESPONSE_BYTES = 64 * 1024

async function readBoundedErrorText(response: Response): Promise<string | null> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_ERROR_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {})
    return null
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- one bounded response reader preserves backpressure.
      const result = await reader.read()
      if (result.done) return text + decoder.decode()
      bytes += result.value.byteLength
      if (bytes > MAX_ERROR_RESPONSE_BYTES) {
        // oxlint-disable-next-line no-await-in-loop -- finish cancelling before releasing the oversized response.
        await reader.cancel().catch(() => {})
        return null
      }
      text += decoder.decode(result.value, { stream: true })
    }
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}
