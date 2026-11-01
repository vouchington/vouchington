import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import {
  COPYRIGHT_CASE_PURGE_JOB_NAME,
  copyrightCasePurgeJobId,
  getCopyrightCasePurgeJobOptions,
} from '../../queues/psql/config.mts'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../data-stores/valkey-core/glide-mq-client.mts'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { installS3TestCredentials } from '@voucha/test-helpers/s3-test-environment'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  advanceCopyrightCasePurgeFixtureClock,
  publishCopyrightCasePurgeCoverage,
  readCopyrightCasePurgeFixture,
  settleCopyrightCasePurgeFixtureActions,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { placeCopyrightCasePreservationHold } from './retention-review-closures.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'
import { COPYRIGHT_CASE_PURGE_PHASES } from './retention-case-purge-order.mts'
import { processCopyrightCasePurge } from '../../workers/psql/processors/copyright-case-purge.mts'

// PostgreSQL fixtures use clock_timestamp(), so only the service's injected clock moves forward.
const PURGE_NOW = new Date('2100-01-01T12:00:00.000Z')

function firstPage(noticeId: string): CopyrightCasePurgeJobData {
  return {
    noticeId,
    phase: 'parties',
    phaseIndex: 0,
    afterId: null,
    legalClockAt: null,
    proofVersion: null,
  }
}

function assertRestartedProof(
  result: Awaited<ReturnType<typeof runCopyrightCasePurgePage>>,
  previousProof: string | null,
): void {
  expect(result.hasMore).toBe(true)
  expect(result.data.phase).toBe('parties')
  expect(result.data.phaseIndex).toBe(1)
  expect(result.data.proofVersion).not.toBe(previousProof)
}

async function assertEvidenceGoneBeforeRoot(noticeId: string, count: number) {
  expect(count).toBe(0)
  expect((await readCopyrightCasePurgeFixture(noticeId)).live).toBe(true)
}

async function assertPurgeFinished(input: {
  noticeId: string
  phases: Set<string>
  evidenceErasedBeforeRoot: boolean
  proofRestartVerified: boolean
  deleteRequests: number
}) {
  expect(await readCopyrightCasePurgeFixture(input.noticeId)).toMatchObject({
    live: false,
    retained: false,
    partyCount: 0,
    submissionCount: 0,
    artifactCount: 0,
  })
  expect([...input.phases]).toEqual(
    expect.arrayContaining([
      'verify_parties',
      'verify_children',
      'coverage',
      'evidence',
      'children',
      'final',
      'residual_parties',
    ]),
  )
  expect(input.evidenceErasedBeforeRoot).toBe(true)
  expect(input.proofRestartVerified).toBe(true)
  expect(input.deleteRequests).toBeGreaterThan(1)
}

function assertPageProof(data: CopyrightCasePurgeJobData): void {
  expect(data.proofVersion).not.toBeNull()
  expect(data.legalClockAt).not.toBeNull()
}

async function finishResidualWithNativeWorker(data: CopyrightCasePurgeJobData): Promise<void> {
  const worker = await startRealGlideBackgroundLifecycle({
    queueNamePrefix: 'copyright_case_purge',
    connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
    processor: job => processCopyrightCasePurge(job as Job<CopyrightCasePurgeJobData>),
    workerOptions: { promotionInterval: 50 },
  })
  try {
    const job = await worker.add(
      {
        name: COPYRIGHT_CASE_PURGE_JOB_NAME,
        options: getCopyrightCasePurgeJobOptions(data.noticeId),
      },
      data,
    )
    expect(job.id).toBe(copyrightCasePurgeJobId(data.noticeId))
    // One party per page forces native updateData and moveToDelayed on this same job id.
    await worker.activated(job, 2)
    await expect(worker.settled(job)).resolves.toBe('completed')
  } finally {
    await worker.close()
  }
}

describe('copyright case purge pages', () => {
  let restoreS3Credentials: (() => void) | undefined
  beforeEach(() => {
    restoreS3Credentials = installS3TestCredentials()
  })
  afterEach(() => {
    restoreS3Credentials?.()
  })
  useAutomaticProvisionalWithholding()
  const bucket = useFakeCopyrightEvidenceBucket()
  const setPageSize = useCopyrightCasePurgePageSize()

  // no-mistakes-timeout-reason: reviewed email fixture, bounded PostgreSQL pages, and native worker continuation
  it('carries a durable proof across bounded pages, deletes every evidence version, then removes the case', async () => {
    expect.hasAssertions()
    await setPageSize(1)
    const entry = await createRetentionEmailCase()
    await settleCopyrightCasePurgeFixtureActions(entry.noticeId)
    await publishCopyrightCasePurgeCoverage(entry.noticeId)
    for (const key of entry.evidenceKeys) bucket.put(key, { versions: 3, deleteMarker: true })
    let data = firstPage(entry.noticeId)
    const phases = new Set<string>()
    const trace: string[] = []
    let evidenceErasedBeforeRoot = false
    let proofRestartVerified = false

    for (let page = 0; page < 1_000; page += 1) {
      if (!proofRestartVerified && data.phase === 'parties' && data.phaseIndex >= 2) {
        const previousProof = data.proofVersion
        await advanceCopyrightCasePurgeFixtureClock(entry.noticeId)
        const restarted = await runCopyrightCasePurgePage(data, PURGE_NOW)
        assertRestartedProof(restarted, previousProof)
        data = restarted.data
        proofRestartVerified = true
      }
      let result: Awaited<ReturnType<typeof runCopyrightCasePurgePage>>
      try {
        result = await runCopyrightCasePurgePage(data, PURGE_NOW)
      } catch (err) {
        throw new Error(
          `Copyright purge page failed at ${data.phase}:${data.phaseIndex} ${COPYRIGHT_CASE_PURGE_PHASES[data.phaseIndex]?.[0] ?? ''}`,
          { cause: err },
        )
      }
      phases.add(result.data.phase)
      trace.push(
        `${data.phase}:${data.phaseIndex}:${data.afterId ?? '-'}>${result.data.phase}:${result.data.phaseIndex}:${result.data.afterId ?? '-'}`,
      )
      if (trace.length > 24) trace.shift()
      if (result.data.phase === 'pointers' && !evidenceErasedBeforeRoot) {
        evidenceErasedBeforeRoot = true
        await assertEvidenceGoneBeforeRoot(
          entry.noticeId,
          bucket.countVersions(entry.evidenceKeys[0]!),
        )
      }
      if (result.data.phase === 'residual_parties') {
        const beforeWorker = await readCopyrightCasePurgeFixture(entry.noticeId)
        if (beforeWorker.live || !beforeWorker.retained || beforeWorker.partyCount < 1)
          throw new Error('Final purge transaction did not leave residual party work')
        // The root DELETE can commit before the job saves its next payload. The
        // native worker must recover from the original payload and drain the links.
        await finishResidualWithNativeWorker(firstPage(entry.noticeId))
        const repeated = await runCopyrightCasePurgePage(firstPage(entry.noticeId), PURGE_NOW)
        if (repeated.hasMore) throw new Error('Completed purge was readmitted from its old payload')
        await assertPurgeFinished({
          noticeId: entry.noticeId,
          phases,
          evidenceErasedBeforeRoot,
          proofRestartVerified,
          deleteRequests: bucket.deleteRequests(),
        })
        return
      }
      if (!result.hasMore)
        throw new Error(
          `Copyright purge stopped while the case was live at ${data.phase}:${data.phaseIndex} ${COPYRIGHT_CASE_PURGE_PHASES[data.phaseIndex]?.[0] ?? ''}`,
        )
      assertPageProof(result.data)
      data = result.data
    }
    throw new Error(
      `Copyright purge failed to finish after 1000 bounded pages at ${data.phase}: ${trace.join('; ')}`,
    )
  }, 30_000)

  // no-mistakes-timeout-reason: reviewed email fixture and PostgreSQL preservation transaction
  it('stops the next page when a case preservation hold lands between pages', async () => {
    await setPageSize(1)
    const entry = await createRetentionEmailCase()
    await publishCopyrightCasePurgeCoverage(entry.noticeId)
    const first = await runCopyrightCasePurgePage(firstPage(entry.noticeId), PURGE_NOW)
    expect(first.hasMore).toBe(true)
    expect(first.data.proofVersion).not.toBeNull()

    await placeCopyrightCasePreservationHold(entry.moderator, entry.noticeId, 'litigation_threat')
    const afterHold = await runCopyrightCasePurgePage(first.data, PURGE_NOW)
    expect(afterHold.hasMore).toBe(false)
    expect(await readCopyrightCasePurgeFixture(entry.noticeId)).toMatchObject({ live: true })
  }, 30_000)

  // A persisted queue payload can be truncated or corrupted between activations.
  // no-mistakes-timeout-reason: real case eligibility and bounded PostgreSQL traversal
  it('fails closed on corrupt child traversal cursors without deleting the case', async () => {
    await setPageSize(1)
    const entry = await createRetentionEmailCase()
    await publishCopyrightCasePurgeCoverage(entry.noticeId)
    const first = await runCopyrightCasePurgePage(firstPage(entry.noticeId), PURGE_NOW)
    const pathIndex = COPYRIGHT_CASE_PURGE_PHASES.findIndex(([, path]) => path.length > 1)
    if (pathIndex < 0) throw new Error('Expected a nested copyright child path')
    const path = COPYRIGHT_CASE_PURGE_PHASES[pathIndex]![1]
    const cursorColumn = path[0]![5][0]!

    const invalidCursor = {
      ...first.data,
      phase: 'verify_children',
      phaseIndex: pathIndex,
      childFrames: [{ values: { id: entry.noticeId }, after: { [cursorColumn]: null } }],
    } as unknown as CopyrightCasePurgeJobData
    await expect(runCopyrightCasePurgePage(invalidCursor, PURGE_NOW)).rejects.toThrow(
      'Invalid copyright purge child cursor',
    )

    const invalidAncestor = {
      ...first.data,
      phase: 'verify_children',
      phaseIndex: pathIndex,
      childFrames: [
        { values: { id: entry.noticeId }, after: null },
        { values: {}, after: null },
      ],
    } as CopyrightCasePurgeJobData
    await expect(runCopyrightCasePurgePage(invalidAncestor, PURGE_NOW)).rejects.toThrow(
      'Invalid copyright purge child path',
    )
    expect(await readCopyrightCasePurgeFixture(entry.noticeId)).toMatchObject({ live: true })
  }, 30_000)
})
