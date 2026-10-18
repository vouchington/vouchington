'use client'

import type { CreateSourceResponseBody } from '@/types/api-responses'
import type { ImportResult } from './import-export'
import { streamImportProgress } from './import-stream'

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
  )
  signal?.throwIfAborted()
  if (!row?.topic_slug || row.status === 'error' || row.status === 'pending') {
    throw new Error('Source import failed')
  }
  return row.topic_slug
}
