import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import {
  createTestUserDirect,
  hardDeleteTestTopic,
  hardDeleteTestUser,
  insertTestTopic,
} from '@voucha/test-helpers'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { withEmbeddingQuotaSnapshot } from '@voucha/test-helpers/embedding-quota-snapshot'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getBatchRecordsCreatedInLastHour } from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'
import {
  BEDROCK_BATCH_MAX_VALUES,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import { getBatchCreationLimits } from '../../rate-limits.mts'
import { creationSubmissionAdmission } from '../../submission-admission.mts'
import {
  getTestBatchEntities,
  getTestBatchSummary,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { createBatch } from '../create.mts'

vi.mock<typeof import('@modules/aws/s3-bedrock-batch')>(
  import('@modules/aws/s3-bedrock-batch'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/s3-bedrock-batch')>()),
    S3BedrockBatchClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof S3BedrockBatchClient,
  }),
)
vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/bedrock-control')>()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof BedrockControlClient,
  }),
)

describe('createBatch input upload failure', () => {
  it('removes persisted batch rows and entity locks when input upload fails', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    const user = await createTestUserDirect()
    const suffix = randomUUID()
    const topicId = await insertTestTopic({ name: suffix, slug: suffix, createdById: user.id })
    const inputFile = join(tmpdir(), `bedrock-upload-${suffix}.jsonl`)
    const entityIdsFile = join(tmpdir(), `bedrock-upload-${suffix}.csv`)
    const error = new Error('input upload failed')
    vi.mocked(S3BedrockBatchClient.send).mockRejectedValueOnce(error)
    try {
      await writeFile(inputFile, '{}\n')
      await writeFile(entityIdsFile, `${topicId}\n`)
      await expect(
        createBatch(
          inputFile,
          'topics',
          1,
          entityIdsFile,
          undefined,
          undefined,
          async () => {},
          () => true,
        ),
      ).rejects.toBe(error)
      const upload = vi.mocked(S3BedrockBatchClient.send).mock.calls[0]![0] as PutObjectCommand
      const batchId = upload.input.Key!.split('/')[1]!
      expect(await getTestBatchEntities(batchId)).toEqual([])
      expect(await getTestBatchSummary(batchId)).toBeNull()
      expect(BedrockControlClient.send).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      await Promise.all([inputFile, entityIdsFile].map(path => rm(path, { force: true })))
    }
  })

  it('cleans an unsubmitted candidate when quota changes during S3 upload', async () => {
    vi.clearAllMocks()
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    const fixture = await acquireEmbeddingQuotaFixture()
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: 100,
      max_inflight_jobs: BEDROCK_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: BEDROCK_BATCH_MAX_VALUES.max_job_size_gb,
    })
    const user = await createTestUserDirect()
    const suffix = randomUUID()
    const topicId = await insertTestTopic({ name: suffix, slug: suffix, createdById: user.id })
    fixture.beforeRelease(async () => {
      await hardDeleteTestTopic(topicId)
      await hardDeleteTestUser(user.id)
      restore()
    })
    const inputFile = join(tmpdir(), `bedrock-quota-${suffix}.jsonl`)
    const entityIdsFile = join(tmpdir(), `bedrock-quota-${suffix}.csv`)
    const uploadEntered = Promise.withResolvers<void>()
    const finishUpload = Promise.withResolvers<void>()
    vi.mocked(S3BedrockBatchClient.send).mockImplementationOnce(() => {
      uploadEntered.resolve()
      return finishUpload.promise as never
    })
    let pending: Promise<string> | undefined
    try {
      await writeFile(inputFile, '{}\n')
      await writeFile(entityIdsFile, `${topicId}\n`)
      pending = createBatch(
        inputFile,
        'topics',
        1,
        entityIdsFile,
        { inputSizeMB: 0.01 },
        {},
        creationSubmissionAdmission({
          dependencies: { getBatchCreationLimits, createBatch },
          isLeaseHeld: () => true,
          jobType: 'topics',
          entityCount: 1,
          inputSizeMB: 0.01,
        }),
        () => true,
      )
      void pending.catch(() => undefined)
      await uploadEntered.promise
      const upload = vi.mocked(S3BedrockBatchClient.send).mock.calls[0]![0] as PutObjectCommand
      const batchId = upload.input.Key!.split('/')[1]!
      await withEmbeddingQuotaSnapshot(async query => {
        const referenceTime = new Date()
        const includingCandidate = await getBatchRecordsCreatedInLastHour(referenceTime, { query })
        const excludingCandidate = await getBatchRecordsCreatedInLastHour(
          referenceTime,
          { query },
          batchId,
        )
        expect(includingCandidate - excludingCandidate).toBe(1)
        const restoreExactCapacity = overrideDynamicConfigFieldsForTest(
          bedrockEmbeddingsBatchConfig,
          { max_requests_per_hour: includingCandidate },
        )
        try {
          expect(await getBatchCreationLimits(referenceTime, { query })).toMatchObject({
            allowed: false,
            reason: 'hourly_request_limit_exceeded',
          })
          expect(await getBatchCreationLimits(referenceTime, { query }, batchId)).toMatchObject({
            allowed: true,
            maxRecords: 1,
          })
        } finally {
          restoreExactCapacity()
        }
      })
      await fixture.insertCompletedControl(100)
      expect(await getBatchCreationLimits(new Date())).toMatchObject({
        allowed: false,
        reason: 'hourly_request_limit_exceeded',
      })
      finishUpload.resolve()
      await expect(pending).rejects.toMatchObject({ reason: 'quota_changed_before_submit' })
      expect(await getTestBatchEntities(batchId)).toEqual([])
      expect(await getTestBatchSummary(batchId)).toBeNull()
      expect(BedrockControlClient.send).not.toHaveBeenCalled()
    } finally {
      finishUpload.resolve()
      await pending?.catch(() => undefined)
      await fixture.close()
      vi.unstubAllEnvs()
      await Promise.all([inputFile, entityIdsFile].map(path => rm(path, { force: true })))
    }
  })
})
