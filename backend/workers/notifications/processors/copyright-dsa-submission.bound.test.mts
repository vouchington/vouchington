import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  countTestDsaSubmissionsForRestriction,
  createTestDsaSubmission,
  makeTestDsaSubmissionDue,
  readTestDsaSubmission,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import { readTestDsaSubmissionForRestriction } from '@voucha/test-helpers/dsa-statement-build-failure-fixtures'
import { useDsaStatementSubmissions } from '@voucha/test-helpers/dsa-switches'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { DSA_TEST_PROVIDER_ORIGIN } from '@voucha/test-helpers/dsa-transparency-database-provider'
import { notifications } from '@queues/notifications/queues'
import { processReconcileDsaStatementSubmissions } from './copyright-dsa-submission.mts'

describe('DSA reconciliation bounded pages', () => {
  useDsaStatementSubmissions()
  beforeEach(() => {
    installTestMediaDeliveryEdge()
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', `${DSA_TEST_PROVIDER_ORIGIN}/api/v1`)
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('reports another due page while leaving equally due excluded work untouched', async () => {
    const excludedId = await createTestDsaSubmission()
    const firstId = await createTestDsaSubmission()
    const secondId = await createTestDsaSubmission()
    await makeTestDsaSubmissionDue(firstId)
    await makeTestDsaSubmissionDue(secondId)
    await makeTestDsaSubmissionDue(excludedId)
    const excludedRestriction = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )

    await expect(
      processReconcileDsaStatementSubmissions(
        {
          restrictionIds: [],
          submissionIds: [firstId, secondId],
        },
        1,
      ),
    ).resolves.toEqual({ enqueued: 1, hasMore: true })
    expect(
      (await readAllQueueJobs(notifications)).filter(
        job =>
          job.name === 'notifications.processSubmitDsaStatementOfReasons' &&
          [firstId, secondId, excludedId].includes(
            (job.data as { submissionId: string }).submissionId,
          ),
      ),
    ).toMatchObject([{ data: { submissionId: firstId } }])
    expect((await readTestDsaSubmission(excludedId)).lease_token).toBeNull()
    expect(await countTestDsaSubmissionsForRestriction(excludedRestriction.restrictionId)).toBe(0)
  })

  it('resumes materialization on the next tick and preserves excluded restrictions and due rows', async () => {
    const first = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const second = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const excluded = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const excludedSubmissionId = await createTestDsaSubmission()
    await makeTestDsaSubmissionDue(excludedSubmissionId)
    const options = {
      restrictionIds: [first.restrictionId, second.restrictionId],
      submissionIds: [],
    }

    await expect(processReconcileDsaStatementSubmissions(options, 1)).resolves.toEqual({
      enqueued: 0,
      hasMore: true,
    })
    expect(await countTestDsaSubmissionsForRestriction(first.restrictionId)).toBe(1)
    expect(await countTestDsaSubmissionsForRestriction(second.restrictionId)).toBe(0)
    expect(await countTestDsaSubmissionsForRestriction(excluded.restrictionId)).toBe(0)
    await expect(processReconcileDsaStatementSubmissions(options, 1)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    expect(await countTestDsaSubmissionsForRestriction(first.restrictionId)).toBe(1)
    expect(await countTestDsaSubmissionsForRestriction(second.restrictionId)).toBe(1)
    expect(await countTestDsaSubmissionsForRestriction(excluded.restrictionId)).toBe(0)
    const firstSubmission = await readTestDsaSubmissionForRestriction(first.restrictionId)
    const secondSubmission = await readTestDsaSubmissionForRestriction(second.restrictionId)
    expect(
      (await readAllQueueJobs(notifications)).filter(
        job =>
          job.name === 'notifications.processSubmitDsaStatementOfReasons' &&
          [firstSubmission.id, secondSubmission.id, excludedSubmissionId].includes(
            (job.data as { submissionId: string }).submissionId,
          ),
      ),
    ).toEqual([])
    expect((await readTestDsaSubmission(excludedSubmissionId)).lease_token).toBeNull()
  })
})
