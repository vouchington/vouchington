import { expect } from 'vitest'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import type { recordCopyrightEmailThreadReferences } from '../services/copyright-notices/email-threading.mts'
import type {
  eraseIntakePage,
  EdgeCursor,
} from '../services/copyright-notices/operational-retention-email-intake-page.mts'
import type { CopyrightEvidenceBucket } from './services/copyright-notices/retention-evidence-bucket.mts'
import {
  readCopyrightIntakeRetentionState,
  readCopyrightEmailReceiptErasedAt,
} from './copyright-email-retention-state.mts'
import {
  readCopyrightThreadReferenceState,
  readCopyrightIntakeRecommendationCount,
} from './copyright-operational-email-retention.mts'
import { readCopyrightEmailIntakeNoticeLinks } from './data-stores/psql/copyright-email-intakes.mts'

type Erasure = PromiseSettledResult<Awaited<ReturnType<typeof eraseIntakePage>>>
type Before = Awaited<ReturnType<typeof readCopyrightIntakeRetentionState>>
type References = Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>

/** A marker and recommendation never leave a live recommendation on an erased receipt. */
export async function assertCopyrightRecommendationMarkerRace(input: {
  intakeId: string
  storageKey: string
  erasure: Erasure
  appended: PromiseSettledResult<boolean>
  before: Before
  beforeReferences: References
  cursor: EdgeCursor
  bucket: CopyrightEvidenceBucket
}) {
  const { intakeId, erasure, appended, before, beforeReferences, cursor, bucket } = input
  const native = ['40001', '40P01'].map(code => ({
    status: 'rejected',
    reason: expect.objectContaining({ code }),
  }))
  const state = {
    intake: await readCopyrightIntakeRetentionState(intakeId),
    references: await readCopyrightThreadReferenceState(intakeId),
    cursor,
    versions: await bucket.countVersions(input.storageKey),
  }
  const unchanged = {
    intake: before,
    references: beforeReferences,
    cursor: { phase: null, edgeId: null },
    versions: 1,
  }
  expect([
    {
      erasure: { status: 'fulfilled', value: { complete: false, erased: true } },
      appended: { status: 'fulfilled', value: false },
      marker: true,
      recommendations: 0,
      state: unchanged,
    },
    ...native.flatMap(failure => [
      {
        erasure: failure,
        appended: { status: 'fulfilled', value: true },
        marker: false,
        recommendations: 1,
        state: unchanged,
      },
      {
        erasure: { status: 'fulfilled', value: { complete: false, erased: true } },
        appended: failure,
        marker: true,
        recommendations: 0,
        state: unchanged,
      },
      ...native.map(writerFailure => ({
        erasure: failure,
        appended: writerFailure,
        marker: false,
        recommendations: 0,
        state: unchanged,
      })),
    ]),
  ]).toContainEqual({
    erasure,
    appended,
    marker: (await readCopyrightEmailReceiptErasedAt(intakeId)) !== null,
    recommendations: await readCopyrightIntakeRecommendationCount(intakeId),
    state,
  })
}

/** Facts may commit before derivation; neither phase may attach fresh facts to an erased receipt. */
export async function assertCopyrightReferenceMarkerRace(input: {
  intakeId: string
  storageKey: string
  erasure: Erasure
  writer: PromiseSettledResult<Awaited<ReturnType<typeof recordCopyrightEmailThreadReferences>>>
  before: Before
  references: References
  cursor: EdgeCursor
  bucket: CopyrightEvidenceBucket
}) {
  const { intakeId, erasure, writer, before, references, cursor, bucket } = input
  const native = ['40001', '40P01'].map(code => ({
    status: 'rejected',
    reason: expect.objectContaining({ code }),
  }))
  const changed = ['40001', '40P01'].map(code => ({
    status: 'rejected',
    reason: expect.objectContaining({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      cause: expect.objectContaining({ code }),
    }),
  }))
  const appendedReferences = { ...references, referenceCount: references.referenceCount + 1 }
  const committedMarker = { status: 'fulfilled', value: { complete: false, erased: true } }
  expect([
    {
      erasure: committedMarker,
      writer: { status: 'fulfilled', value: null },
      marker: true,
      references,
    },
    ...changed.map(failure => ({
      erasure: committedMarker,
      writer: failure,
      marker: true,
      references,
    })),
    ...native.flatMap(failure => [
      {
        erasure: failure,
        writer: { status: 'fulfilled', value: null },
        marker: false,
        references: appendedReferences,
      },
      ...changed.flatMap(writerFailure => [
        { erasure: failure, writer: writerFailure, marker: false, references },
        // Reference facts and derivation are separately committed production phases.
        {
          erasure: failure,
          writer: writerFailure,
          marker: false,
          references: appendedReferences,
        },
      ]),
    ]),
  ]).toContainEqual({
    erasure,
    writer,
    marker: (await readCopyrightEmailReceiptErasedAt(intakeId)) !== null,
    references: await readCopyrightThreadReferenceState(intakeId),
  })
  expect(await readCopyrightIntakeRetentionState(intakeId)).toEqual(before)
  expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([])
  expect(cursor).toEqual({ phase: null, edgeId: null })
  expect(await bucket.countVersions(input.storageKey)).toBe(1)
}
