import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { dataRequestPubSub } from '@data-stores/valkey-pubsub'
import { getDataRequestById, createDataRequest } from '@services/account-data-requests'
import { emails } from '@queues/emails/queues'
import { createTestUser } from '@voucha/test-helpers'
import {
  rejectPostgresReadForTest,
  rejectPostgresWriteForTest,
} from '@voucha/test-helpers/injected-failures'
import { processExportRequest } from './account-data-requests.mts'

// Only the external S3 provider call is replaced; the database, queues, files and zip are real.
const mockS3Send = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: { send: mockS3Send } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

describe('processExportRequest best-effort steps', () => {
  const publish = vi.spyOn(dataRequestPubSub, 'publish')

  beforeEach(() => {
    mockS3Send.mockReset()
    mockS3Send.mockResolvedValue({})
    publish.mockClear()
  })

  it('publishes ready when releasing the settled-upload lease fails', async () => {
    const { subject, request } = await startRequest()
    onTestFinished(
      rejectPostgresWriteForTest('finishDataRequestUpload', new Error('database unavailable')),
    )

    await expect(
      processExportRequest(request.id, subject.id, request.processing_attempt_id),
    ).resolves.toBeUndefined()

    expect((await getDataRequestById(subject.id, subject.id, request.id))?.status).toBe('ready')
    expect(publish).toHaveBeenCalledWith(request.id, { status: 'ready' })
  })

  it.each(['getPrivateUserByAny', 'wasDataRequestMadeBySubject'])(
    'keeps the export ready when the %s notification lookup rejects',
    async marker => {
      const { subject, request } = await startRequest()
      onTestFinished(rejectPostgresReadForTest(marker, new Error('best-effort failure')))

      await expect(
        processExportRequest(request.id, subject.id, request.processing_attempt_id),
      ).resolves.toBeUndefined()

      expect((await getDataRequestById(subject.id, subject.id, request.id))?.status).toBe('ready')
      expect(await emails.getJob(`data-export-ready__${request.id}`)).toBeNull()
    },
  )

  it('keeps the export ready when the notification enqueue rejects', async () => {
    const { subject, request } = await startRequest()
    const add = vi.spyOn(emails, 'add').mockRejectedValue(new Error('best-effort failure'))

    await expect(
      processExportRequest(request.id, subject.id, request.processing_attempt_id),
    ).resolves.toBeUndefined()

    expect(add).toHaveBeenCalledOnce()
    expect((await getDataRequestById(subject.id, subject.id, request.id))?.status).toBe('ready')
  })
})

async function startRequest() {
  const subject = await createTestUser()
  const request = await createDataRequest(subject.id, subject.id)
  return { subject, request }
}
