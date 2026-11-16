import { beginTransaction } from '@data-stores/psql'
import {
  createOutboundCopyrightCorrespondence,
  createDeterministicCopyrightCorrespondencesInTransaction,
} from '../services/copyright-notices/correspondence.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** A real outbound writer reaches the first writer's case before its next decision message. */
export async function raceCopyrightCorrespondenceWriters(noticeId: string) {
  const input = {
    noticeId,
    submissionId: null,
    correspondenceKind: 'status_update' as const,
    compositionKind: 'staff' as const,
    bodyCiphertext: `draft-${crypto.randomUUID()}`,
    draftedById: null,
  }
  await using first = await beginTransaction()
  const firstMessage = await createOutboundCopyrightCorrespondence(input, first)
  const holderProcessId = await getTestPostgresBackendProcessId(first)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'CopyrightCorrespondence',
      releaseHolder: () => first[Symbol.asyncDispose](),
    },
    async waitForWrite => {
      const second = createOutboundCopyrightCorrespondence(input)
      const settled = Promise.allSettled([second])
      await waitForWrite(second)
      const messages = await createDeterministicCopyrightCorrespondencesInTransaction(
        [
          {
            noticeId,
            submissionId: null,
            correspondenceKind: 'decision_notice',
            bodyText: 'A case decision.',
          },
        ],
        first,
      )
      await first.commit()
      const [outcome] = await settled
      if (outcome?.status !== 'fulfilled') throw outcome?.reason
      return [firstMessage, ...messages, outcome.value]
    },
  )
}
