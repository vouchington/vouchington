import { copyrightEmailThreadChangedError } from './email-thread-graph.mts'

/** Map only serialization and the token/source guards that can race thread admission. */
export function throwIfCopyrightEmailThreadWriteConflict(err: unknown): void {
  const failure = err as { code?: string; constraint?: string; message?: string } | null
  if (
    failure?.code === '40001' ||
    (failure?.code === '23503' &&
      (failure.constraint === 'fk_copyright_notice_email_thread_references__token' ||
        failure.constraint === 'fk_copyright_notice_email_intake_notice_links__matched_token')) ||
    (failure?.code === '23514' &&
      (failure.message === 'copyright email intake is under retention erasure' ||
        failure.message === 'erased copyright case cannot acquire an email intake' ||
        failure.message ===
          'reviewed copyright email intake cannot be linked as thread correspondence'))
  )
    throw copyrightEmailThreadChangedError(err)
}
