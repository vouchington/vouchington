'use client'

import type { CreateSourceResponseBody } from '@/types/api-responses'
import { ApiError } from '../error'
import type { ImportResult } from './import-export'
import { streamImportProgress } from './import-stream'

/** Row failures a person caused or can fix; anything else is an unexpected import failure. */
const EXPECTED_IMPORT_ERROR_CODES: ReadonlySet<string> = new Set([
  'INVALID_URL',
  'INVALID_FEED_CONTENT',
  'FEED_FETCH_TIMEOUT',
  'CONTRIBUTION_LIMIT_EXCEEDED',
])

/**
 * A terminal row failure as an `ApiError` carrying the row's stable `error_code`, so callers can
 * map it to copy and expected failures stay out of Sentry.
 */
function sourceImportError(row: ImportResult | undefined): ApiError {
  const code = row?.error_code
  const expected = code !== undefined && EXPECTED_IMPORT_ERROR_CODES.has(code)
  return new ApiError('Source import failed', expected ? 422 : 500, code ? { code } : undefined)
}

/** Poll the accepted import before resolving its feed's navigation slug. */
export async function waitForSourceImport(
  submission: CreateSourceResponseBody,
  signal?: AbortSignal,
): Promise<string> {
  let row: ImportResult | undefined
  await streamImportProgress(
    submission.import.id,
    () => {},
    signal,
    status => {
      row = status.rows[0]
    },
    { retryNotFound: true },
  )
  signal?.throwIfAborted()
  if (!row?.topic_slug || row.status === 'error' || row.status === 'pending') {
    throw sourceImportError(row)
  }
  return row.topic_slug
}
