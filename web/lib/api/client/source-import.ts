'use client'

import type { CreateSourceResponseBody } from '@/types/api-responses'
import type { MessageKey, Translator } from '@ts-shared/ui-messages'
import { ApiError } from '../error'
import type { ImportResult, RssFeedImportErrorCode } from './import-export'
import { streamImportProgress } from './import-stream'

export type SourceImportCompletion = { entityId: string; topicSlug?: string }

const SOURCE_IMPORT_ERROR_MESSAGE_KEYS = {
  INVALID_URL: 'extracted.api.errorHelpers.theRequestWasInvalidPleaseTry_ac456788',
  INVALID_FEED_CONTENT: 'extracted.api.errorHelpers.theRequestWasInvalidPleaseTry_ac456788',
  FEED_FETCH_TIMEOUT: 'extracted.api.errorHelpers.theRequestTimedOutPleaseTry_e5893a0d',
  CONTRIBUTION_LIMIT_EXCEEDED:
    'extracted.posts.contributionGatedCta.youHaveReachedTheCurrentContribution_b3fa428c',
  IMPORT_FAILED: 'extracted.api.errorHelpers.anErrorOccurredPleaseTryAgain_9c170dda',
} as const satisfies Record<RssFeedImportErrorCode, MessageKey>

export function getSourceImportErrorMessages(t: Translator): Record<string, string> {
  return Object.fromEntries(
    Object.entries(SOURCE_IMPORT_ERROR_MESSAGE_KEYS).map(([code, key]) => [code, t(key)]),
  )
}

/** Poll the accepted import before resolving its completed feed and optional navigation slug. */
export async function waitForSourceImport(
  submission: CreateSourceResponseBody,
  signal?: AbortSignal,
): Promise<SourceImportCompletion> {
  let row: ImportResult | undefined
  await streamImportProgress(
    submission.import.id,
    () => {},
    signal,
    status => {
      row = status.rows[0]
    },
  )
  signal?.throwIfAborted()
  if (row?.status === 'error') {
    throw new ApiError('Source import failed', 422, { code: row.error_code ?? 'IMPORT_FAILED' })
  }
  if (!row?.entity_id || row.status === 'pending') {
    throw new Error('Source import failed')
  }
  return { entityId: row.entity_id, ...(row.topic_slug ? { topicSlug: row.topic_slug } : {}) }
}
