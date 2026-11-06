import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
  type MockInstance,
} from 'vitest'
import { dataRequestPubSub } from '@data-stores/valkey-pubsub'
import { S3Buckets } from '@modules/aws'
import {
  createDataRequest,
  getDataRequestById,
  markDataRequestFailed,
} from '@services/account-data-requests'
import { emails } from '@queues/emails/queues'
import {
  createTestUser,
  getTestDataRequestAttemptFence,
  updateTestUserUiLocale,
} from '@voucha/test-helpers'
import {
  rejectPostgresReadForTest,
  rejectPostgresWriteForTest,
} from '@voucha/test-helpers/injected-failures'
import { readZipEntries } from '@voucha/test-helpers/read-zip-entries'
import { processExportRequest } from './account-data-requests.mts'

// Only the external S3 provider call is replaced; the database, queues, files and zip are real.
const mockS3Send = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: { send: mockS3Send } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

type SentCommand = {
  constructor: { name: string }
  input: { Bucket?: string; Key?: string; Body?: unknown }
}

describe('processExportRequest', () => {
  const s3Send = mockS3Send
  let publish: MockInstance<typeof dataRequestPubSub.publish>

  beforeEach(() => {
    s3Send.mockReset()
    s3Send.mockResolvedValue({})
    publish = vi.spyOn(dataRequestPubSub, 'publish')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('uploads the zip to the export bucket, marks the request ready, and emails the subject', async () => {
    const { subject, request } = await startRequest()
    const tempRoot = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    onTestFinished(() => rm(tempRoot, { recursive: true, force: true }))
    await updateTestUserUiLocale(subject.id, 'fr')
    let uploadedZip: Buffer | undefined
    s3Send.mockImplementation(async command => {
      const { Body } = (command as SentCommand).input
      if (commandName(command) === 'PutObjectCommand' && Body) {
        const chunks: Buffer[] = []
        for await (const chunk of Body as AsyncIterable<Buffer>) chunks.push(chunk)
        uploadedZip = Buffer.concat(chunks)
      }
      return {}
    })

    const attemptId = request.processing_attempt_id
    await processExportRequest(request.id, subject.id, attemptId, true, tempRoot)

    if (!uploadedZip) throw new Error('Expected the export zip to be uploaded')
    const files = readZipEntries(uploadedZip)
    expect(files['profile.csv']).toContain(subject.id)

    const key = `${request.id}/${request.processing_attempt_id}.zip`
    expect(sentCommands(request.id)).toEqual([
      { name: 'PutObjectCommand', bucket: S3Buckets.userExports, key },
    ])
    const ready = await getDataRequestById(subject.id, subject.id, request.id)
    expect(ready).toMatchObject({ status: 'ready', s3_key: key })
    expect(ready?.expires_at).toBeInstanceOf(Date)
    expect((await getTestDataRequestAttemptFence(request.id))?.upload_lease_expires_at).toBeNull()
    expect(publish).toHaveBeenCalledWith(request.id, { status: 'ready' })
    const email = await emails.getJob(`data-export-ready__${request.id}`)
    expect(email?.data).toEqual({
      input: { userId: subject.id, uiLocale: 'fr' },
      variables: { requestId: request.id },
    })
    expect(await readdir(tempRoot)).toEqual([])
  })

  it('emails a subject without a UI locale with a null locale', async () => {
    const { subject, request } = await startRequest()
    await updateTestUserUiLocale(subject.id, null)

    await processExportRequest(request.id, subject.id, request.processing_attempt_id)

    const email = await emails.getJob(`data-export-ready__${request.id}`)
    expect(email?.data).toEqual({
      input: { userId: subject.id, uiLocale: null },
      variables: { requestId: request.id },
    })
  })

  it('does not email the subject about an export that an administrator requested', async () => {
    const { subject, requester, request } = await startRequest({ administrator: true })

    await processExportRequest(request.id, subject.id, request.processing_attempt_id)

    expect((await getDataRequestById(subject.id, requester.id, request.id))?.status).toBe('ready')
    expect(publish).toHaveBeenCalledWith(request.id, { status: 'ready' })
    expect(await emails.getJob(`data-export-ready__${request.id}`)).toBeNull()
  })

  it('does not start a request whose attempt was already claimed', async () => {
    const { subject, request } = await startRequest()
    await processExportRequest(request.id, subject.id, request.processing_attempt_id)
    s3Send.mockClear()
    publish.mockClear()

    await processExportRequest(request.id, subject.id, request.processing_attempt_id)

    expect(sentCommands(request.id)).toEqual([])
    expect(publish).not.toHaveBeenCalled()
  })

  it('does not upload when the attempt cannot take the provider-effect lease', async () => {
    const { subject, request } = await startRequest()

    await processExportRequest(request.id, subject.id)

    expect(sentCommands(request.id)).toEqual([])
    expect(await getDataRequestById(subject.id, subject.id, request.id)).toMatchObject({
      status: 'processing',
      last_error_message: null,
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it('marks the request failed, publishes the failure, and cleans up after an upload error', async () => {
    const { subject, request } = await startRequest()
    const tempRoot = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    onTestFinished(() => rm(tempRoot, { recursive: true, force: true }))
    s3Send.mockRejectedValue(new Error('S3 upload failed'))

    await expect(
      processExportRequest(request.id, subject.id, request.processing_attempt_id, true, tempRoot),
    ).rejects.toThrow(`Export failed for request ${request.id}`)

    expect(await getDataRequestById(subject.id, subject.id, request.id)).toMatchObject({
      status: 'failed',
      last_error_message: 'S3 upload failed',
    })
    expect(publish).toHaveBeenCalledWith(request.id, { status: 'failed' })
    expect(
      (await getTestDataRequestAttemptFence(request.id))?.upload_lease_expires_at,
    ).not.toBeNull()
    expect(await readdir(tempRoot)).toEqual([])
  })

  it('leaves a retryable failure unpublished before the final attempt', async () => {
    const { subject, request } = await startRequest()
    s3Send.mockRejectedValue(new Error('S3 upload failed'))

    await expect(
      processExportRequest(request.id, subject.id, request.processing_attempt_id, false),
    ).rejects.toThrow(`Export failed for request ${request.id}`)

    expect(await getDataRequestById(subject.id, subject.id, request.id)).toMatchObject({
      status: 'pending',
      last_error_message: 'S3 upload failed',
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it('does not publish a failure for a request that another path already failed', async () => {
    const { subject, request } = await startRequest()
    s3Send.mockImplementation(async () => {
      await markDataRequestFailed(request.id, request.processing_attempt_id, 'failed elsewhere')
      throw new Error('S3 upload failed')
    })

    await expect(
      processExportRequest(request.id, subject.id, request.processing_attempt_id),
    ).rejects.toThrow(`Export failed for request ${request.id}`)

    expect(await getDataRequestById(subject.id, subject.id, request.id)).toMatchObject({
      status: 'failed',
      last_error_message: 'failed elsewhere',
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it.each([
    ['succeeds', async () => ({})],
    ['fails', () => Promise.reject(new Error('S3 error'))],
  ])(
    'deletes the orphaned S3 object when the request failed during upload and the delete %s',
    async (_outcome, deleteResult) => {
      const { subject, request } = await startRequest()
      s3Send.mockImplementation(async command => {
        if (commandName(command) === 'DeleteObjectCommand') return deleteResult()
        await markDataRequestFailed(request.id, request.processing_attempt_id, 'account deleted')
        return {}
      })

      await expect(
        processExportRequest(request.id, subject.id, request.processing_attempt_id),
      ).resolves.toBeUndefined()

      expect(sentCommands(request.id)).toEqual([
        {
          name: 'PutObjectCommand',
          bucket: S3Buckets.userExports,
          key: `${request.id}/${request.processing_attempt_id}.zip`,
        },
        {
          name: 'DeleteObjectCommand',
          bucket: S3Buckets.userExports,
          key: `${request.id}/${request.processing_attempt_id}.zip`,
        },
      ])
      expect(await getDataRequestById(subject.id, subject.id, request.id)).toMatchObject({
        status: 'failed',
        last_error_message: 'account deleted',
        s3_key: null,
      })
      expect(publish).not.toHaveBeenCalled()
      expect(await emails.getJob(`data-export-ready__${request.id}`)).toBeNull()
    },
  )

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

  function sentCommands(requestId: string) {
    return s3Send.mock.calls
      .map(([command]) => command as unknown as SentCommand)
      .filter(command => command.input.Key?.startsWith(`${requestId}/`))
      .map(command => ({
        name: command.constructor.name,
        bucket: command.input.Bucket,
        key: command.input.Key,
      }))
  }
})

function commandName(command: unknown): string {
  return (command as SentCommand).constructor.name
}
async function startRequest(options: { administrator?: boolean } = {}) {
  const subject = await createTestUser()
  const requester = options.administrator ? await createTestUser({ administrator: true }) : subject
  const request = await createDataRequest(subject.id, requester.id)
  return { subject, requester, request }
}
