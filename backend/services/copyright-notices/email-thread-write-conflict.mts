import { copyrightEmailThreadChangedError } from './email-thread-graph.mts'

/** Map only the token and source guards that can race thread admission. */
export function throwIfCopyrightEmailThreadWriteConflict(err: unknown): void {
  const failure = err as { code?: string; constraint?: string; message?: string } | null
  if (
    (failure?.code === '23503' &&
      (failure.constraint === 'fk_copyright_notice_email_thread_references__token' ||
        failure.constraint === 'fk_copyright_notice_email_intake_notice_links__matched_token')) ||
    (failure?.code === '23514' &&
      failure.message === 'copyright email intake is under retention erasure')
  )
    throw copyrightEmailThreadChangedError(err)
}
