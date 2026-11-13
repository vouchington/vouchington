import type { QueryExecutor } from '@data-stores/psql'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import createError from 'http-errors'

/** A retired graph cannot acquire new references, edges or thread links. */
export async function assertCopyrightThreadAcceptsEvidence(
  query: QueryExecutor,
  noticeId: string,
): Promise<void> {
  if (await readCopyrightThreadRetirement(query, [noticeId]))
    throw Object.assign(createError(409, 'Copyright case email threading has been retired'), {
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
    })
}
