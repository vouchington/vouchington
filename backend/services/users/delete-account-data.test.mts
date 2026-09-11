import { describe, expect, it } from 'vitest'
import {
  claimRecoverableDataRequests,
  createDataRequest,
  finishDataRequestUpload,
  leaseDataRequestUpload,
  markDataRequestProcessing,
} from '@services/account-data-requests'
import {
  createTestUser,
  getTestUserDeletionExternalWorkKeys,
  getUserDataRequestStatusAndS3KeyForTest,
  makeUserDataRequestRecoverableForTest,
} from '@voucha/test-helpers'
import { deleteUser } from './delete.mts'
import { processUserDeletionPhaseBatch } from './delete-phases.mts'

describe('user deletion account-data phase', () => {
  it('leaves a leased upload key pending until the provider effect settles', async () => {
    const user = await createTestUser()
    const exportRequest = await createDataRequest(user.id)
    expect(
      await markDataRequestProcessing(exportRequest.id, exportRequest.processing_attempt_id),
    ).toBe(true)
    expect(
      await leaseDataRequestUpload(exportRequest.id, exportRequest.processing_attempt_id),
    ).toBeInstanceOf(Date)
    const deletion = await deleteUser(user, user)

    await processAccountDataBatch(deletion, user.id)
    await expect(
      getTestUserDeletionExternalWorkKeys(deletion.requestId, 's3-export'),
    ).resolves.not.toContain(`${exportRequest.id}/${exportRequest.processing_attempt_id}.zip`)

    await finishDataRequestUpload(exportRequest.id, exportRequest.processing_attempt_id)
    await processAccountDataBatch(deletion, user.id)
    await expect(
      getTestUserDeletionExternalWorkKeys(deletion.requestId, 's3-export'),
    ).resolves.toContain(`${exportRequest.id}/${exportRequest.processing_attempt_id}.zip`)
  })

  it('records cleanup for a claimed export before expiring its request', async () => {
    const user = await createTestUser()
    const exportRequest = await createDataRequest(user.id)
    expect(
      await markDataRequestProcessing(exportRequest.id, exportRequest.processing_attempt_id),
    ).toBe(true)
    const deletion = await deleteUser(user, user)

    await processAccountDataBatch(deletion, user.id)
    await processAccountDataBatch(deletion, user.id)

    await expect(
      getTestUserDeletionExternalWorkKeys(deletion.requestId, 's3-export'),
    ).resolves.toContain(`${exportRequest.id}/${exportRequest.processing_attempt_id}.zip`)
    await expect(getUserDataRequestStatusAndS3KeyForTest(exportRequest.id)).resolves.toMatchObject({
      status: 'failed',
      s3_key: null,
    })
  })

  it('records every claimed export key retained across stale recovery', async () => {
    const user = await createTestUser()
    const exportRequest = await createDataRequest(user.id)
    const staleAttemptId = exportRequest.processing_attempt_id
    expect(await markDataRequestProcessing(exportRequest.id, staleAttemptId)).toBe(true)
    await makeUserDataRequestRecoverableForTest(exportRequest.id, 'stale')
    const recovered = (await claimRecoverableDataRequests()).find(
      candidate => candidate.requestId === exportRequest.id,
    )
    expect(recovered?.processingAttemptId).not.toBe(staleAttemptId)
    if (!recovered) throw new Error('Expected recovered export request')
    expect(await markDataRequestProcessing(exportRequest.id, recovered.processingAttemptId)).toBe(
      true,
    )
    const deletion = await deleteUser(user, user)

    await processAccountDataBatch(deletion, user.id)
    await processAccountDataBatch(deletion, user.id)

    await expect(
      getTestUserDeletionExternalWorkKeys(deletion.requestId, 's3-export'),
    ).resolves.toEqual(
      expect.arrayContaining([
        `${exportRequest.id}/${staleAttemptId}.zip`,
        `${exportRequest.id}/${recovered.processingAttemptId}.zip`,
      ]),
    )
  })
})

async function processAccountDataBatch(
  deletion: { requestId: string; processingAttemptId: string },
  userId: string,
): Promise<void> {
  await processUserDeletionPhaseBatch({
    requestId: deletion.requestId,
    userId,
    processingAttemptId: deletion.processingAttemptId,
    phase: 'account-data',
    batchSize: 100,
  })
}
