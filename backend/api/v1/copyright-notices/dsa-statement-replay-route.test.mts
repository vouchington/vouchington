import { describe, expect, it } from 'vitest'
import { createTestUser, readAllQueueJobs } from '@voucha/test-helpers'
import { notifications } from '@queues/notifications/queues'
import { createRequest } from '@voucha/test-helpers/api/server'
import { DSA_TEST_UUID } from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  readTestDsaAttempts,
  seedTestDsaDeadLetter,
  seedTestDsaFailureRound,
  seedTestDsaSubmission,
  seedTestDsaSubmitted,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'

const path = (id: string) => `/api/v1/copyright-dsa-statement-submissions/${id}/replays`

async function requestAs(options?: Parameters<typeof createTestUser>[0]) {
  const user = await createTestUser(options)
  const request = createRequest()
  await request.authenticateAs(user)
  return { request, user }
}

async function deadLetter(): Promise<string> {
  const image = await createTestCopyrightImageFixture('post-image')
  const restriction = await createTestCopyrightRestrictionForImage(image)
  const id = await seedTestDsaSubmission(restriction.restrictionId)
  await seedTestDsaDeadLetter(id)
  return id
}

describe('POST copyright DSA statement replay', () => {
  it('replays a dead-lettered round once and records the administrator identity', async () => {
    const id = await deadLetter()
    const { request, user } = await requestAs({ extraRoles: ['administrator'] })
    expect((await request.post(path(id)).expect(200)).body).toEqual({ replayed: true })
    expect((await request.post(path(id)).expect(200)).body).toEqual({ replayed: false })
    expect((await readTestDsaAttempts(id)).at(-1)).toMatchObject({
      attempt_number: 6,
      outcome: 'replayed',
      replayed_by_id: user.id,
    })
    expect(
      (await readAllQueueJobs(notifications)).filter(
        job =>
          job.name === 'processSubmitDsaStatementOfReasons' &&
          (job.data as { submissionId?: string }).submissionId === id,
      ),
    ).toEqual([])
    expect((await request.post(path(crypto.randomUUID())).expect(200)).body).toEqual({
      replayed: false,
    })
  })

  it('leaves an active retry round and an already submitted statement untouched', async () => {
    const image = await createTestCopyrightImageFixture('post-image')
    const restriction = await createTestCopyrightRestrictionForImage(image)
    const pendingId = await seedTestDsaSubmission(restriction.restrictionId)
    await seedTestDsaFailureRound(pendingId, 1, 1)
    const secondImage = await createTestCopyrightImageFixture('post-image')
    const secondRestriction = await createTestCopyrightRestrictionForImage(secondImage)
    const submittedId = await seedTestDsaSubmission(secondRestriction.restrictionId)
    await seedTestDsaSubmitted(submittedId, DSA_TEST_UUID)
    const { request } = await requestAs({ extraRoles: ['administrator'] })
    expect((await request.post(path(pendingId)).expect(200)).body).toEqual({ replayed: false })
    expect((await request.post(path(submittedId)).expect(200)).body).toEqual({ replayed: false })
    expect(await readTestDsaAttempts(pendingId)).toHaveLength(1)
    expect(await readTestDsaAttempts(submittedId)).toHaveLength(1)
  })

  it('restricts replay to administrators and rejects malformed ids', async () => {
    const id = await deadLetter()
    const { request: moderator } = await requestAs({ extraRoles: ['moderator'] })
    const { request: administrator } = await requestAs({ extraRoles: ['administrator'] })
    await createRequest().post(path(id)).expect(401)
    await moderator.post(path(id)).expect(403)
    await administrator.post(path('not-a-uuid')).expect(422)
    expect(await readTestDsaAttempts(id)).toHaveLength(5)
  })
})
