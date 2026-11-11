import type pg from 'pg'
import { beginTransaction, writePool } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import { createTestPostgresClientLoan } from './postgres-client-loan.mts'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { failCopyrightActionIntent } from '../services/copyright-notices/action-delivery-completion.mts'
import { replayFailedCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intent-recovery.mts'
import { associateCopyrightEmailIntakeWithNotice } from '../services/copyright-notices/email-manual-association.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'

type Admission = Parameters<typeof admitCopyrightEmailCorrespondence>[0]

export async function rejectCopyrightAdmissionWithoutSource(
  noticeId: string,
  source: 'correspondence' | 'submission' | 'assessment',
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* rejectCopyrightAdmissionWithoutSource */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, copyright_notice_correspondence_id,
      copyright_notice_submission_id, copyright_notice_submission_assessment_identity_id
    ) VALUES (
      ${noticeId}, ${source === 'assessment' ? 'submission_assessed' : source === 'correspondence' ? 'email_correspondence_admitted' : 'supplement_received'},
      ${source === 'correspondence' ? uuidv7() : null},
      ${source === 'submission' ? uuidv7() : null},
      ${source === 'assessment' ? uuidv7() : null}
    )
  `)
  await transaction.commit()
}

export async function assessAndAssociateCopyrightEmail(
  input: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
  noticeId: string,
  intakeId: string,
) {
  const currentUser = input.currentUser
  if (currentUser === null) throw new Error('Owned assessment overlap requires a reviewer')
  const [assessment, association] = await overlapCopyrightWriters(
    'appendCopyrightSubmissionAssessment',
    () => appendCopyrightSubmissionAssessment(input),
    () => associateCopyrightEmailIntakeWithNotice(currentUser, intakeId, noticeId),
    [noticeId, input.submissionId, intakeId],
  )
  return { assessment, association }
}

/** Resume the first real writer only after the other public actor reaches its native transaction wait. */
export async function admitAndAssociateCopyrightEmail(
  input: Admission,
  noticeId: string,
  associateIntakeId: string,
  first: 'admission' | 'association',
) {
  const admissionMarker =
    input.kind === 'court_or_ccb_hold'
      ? 'preemptCopyrightRestorations'
      : 'admitCopyrightEmailCorrespondence:submission'
  const admit = () => admitCopyrightEmailCorrespondence(input)
  const associate = () =>
    associateCopyrightEmailIntakeWithNotice(input.currentUser, associateIntakeId, noticeId)
  const ids = [noticeId, input.intakeId, associateIntakeId]
  if (first === 'admission') {
    const [admission, association] = await overlapCopyrightWriters(
      admissionMarker,
      admit,
      associate,
      ids,
    )
    return { admission, association }
  }
  const [association, admission] = await overlapCopyrightWriters(
    'associateCopyrightEmailIntakeWithNotice:link',
    associate,
    admit,
    ids,
  )
  return { admission, association }
}

export async function failRestorationAndAdmitCopyrightEmail(
  input: Admission,
  noticeId: string,
  failure: Parameters<typeof failCopyrightActionIntent>[0],
) {
  const [outcome, admission] = await overlapCopyrightWriters(
    'failCopyrightActionIntent',
    () => failCopyrightActionIntent(failure),
    () => admitCopyrightEmailCorrespondence(input),
    [noticeId, input.intakeId, failure.intentId],
  )
  return { outcome, admission }
}

export async function replayDeliveryAndAssociateCopyrightEmail(
  currentUser: Admission['currentUser'],
  noticeId: string,
  intentId: string,
  intakeId: string,
) {
  const [replayed, association] = await overlapCopyrightWriters(
    'replayFailedCopyrightDeliveryIntent',
    () => replayFailedCopyrightDeliveryIntent({ intentId, noticeId, actorUserId: currentUser.id }),
    () => associateCopyrightEmailIntakeWithNotice(currentUser, intakeId, noticeId),
    [noticeId, intentId, intakeId],
  )
  return { replayed, association }
}

export async function overlapCopyrightWriters<First, Second>(
  firstMarker: string,
  firstOperation: () => Promise<First>,
  secondOperation: () => Promise<Second>,
  ownedIds: string[],
): Promise<[First, Second]> {
  return runPoolObservationExclusively(async () => {
    const loanReady = Promise.withResolvers<ReturnType<typeof createTestPostgresClientLoan>>()
    void loanReady.promise.catch(() => {})
    const restorations = new Map<pg.PoolClient, () => void>()
    const loans = new Map<pg.PoolClient, ReturnType<typeof createTestPostgresClientLoan>>()
    let firstClient: pg.PoolClient | undefined
    let transactionId: string | undefined
    let first: Promise<First> | undefined
    let second: Promise<Second> | undefined
    let startedSecond = false
    const observe = (client: pg.PoolClient) => {
      if (restorations.has(client)) return
      const descriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const original = client.query
      restorations.set(client, () => {
        if (descriptor) Object.defineProperty(client, 'query', descriptor)
        else Reflect.deleteProperty(client, 'query')
      })
      const query = ((...args: unknown[]) => {
        const statement = args[0]
        if (
          typeof statement !== 'object' ||
          statement === null ||
          !('text' in statement) ||
          typeof statement.text !== 'string' ||
          !('values' in statement) ||
          !Array.isArray(statement.values) ||
          !statement.values.some(value => typeof value === 'string' && ownedIds.includes(value))
        )
          return Reflect.apply(original, client, args)
        if (transactionId && client !== firstClient && !loans.has(client)) {
          const loan = createTestPostgresClientLoan(client, { kind: 'transaction', transactionId })
          loans.set(client, loan)
          loanReady.resolve(loan)
          return loan.ready.then(() => Reflect.apply(original, client, args))
        }
        const pending = Reflect.apply(original, client, args)
        if (!startedSecond && statement.text.includes(`/* ${firstMarker} */`)) {
          firstClient = client
          startedSecond = true
          return Promise.resolve(pending).then(async result => {
            const id = await client.query<{ id: string }>('SELECT pg_current_xact_id()::text AS id')
            transactionId = id.rows[0]!.id
            second = secondOperation()
            const outcome = Promise.allSettled([second])
            void outcome.then(([settled]) => {
              if (settled?.status === 'rejected') loanReady.reject(settled.reason)
            })
            const loan = await loanReady.promise
            await loan.ready
            // Removing a redundant generation write can let the sibling commit without waiting.
            // Resume after that completed public effect or its native transaction wait.
            await loan.wait(outcome).catch(async (err: unknown) => {
              const [settled] = await outcome
              if (settled?.status !== 'fulfilled') throw err
            })
            return result
          })
        }
        return pending
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      await (first = firstOperation())
      if (first === undefined || second === undefined)
        throw new Error('Owned writes did not reach the overlap')
      return await Promise.all([first, second])
    } finally {
      await Promise.allSettled([first, second])
      await Promise.allSettled([...loans.values()].map(loan => loan.dispose()))
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
