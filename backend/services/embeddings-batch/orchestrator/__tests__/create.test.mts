import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import {
  createTestUserDirect,
  hardDeleteTestTopic,
  hardDeleteTestUser,
  insertTestTopic,
} from '@voucha/test-helpers'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { withEmbeddingQuotaSnapshot } from '@voucha/test-helpers/embedding-quota-snapshot'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getBatchRecordsCreatedInLastHour } from '@services/embeddings/batch/orchestrator/poll-queries'
import {
  GEMINI_BATCH_MAX_VALUES,
  geminiEmbeddingsBatchConfig,
} from '@services/embeddings/batch/config'
import { getBatchCreationLimits } from '../../rate-limits.mts'
import { creationSubmissionAdmission } from '../../submission-admission.mts'
import {
  getTestBatchEntities,
  getTestBatchSummary,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { createBatch } from '../create.mts'

describe('createBatch input upload failure', () => {
  it('removes persisted batch rows and entity locks when input upload fails', async () => {
    const http = createVertexHttpFixture()
    const user = await createTestUserDirect()
    const suffix = randomUUID()
    const topicId = await insertTestTopic({ name: suffix, slug: suffix, createdById: user.id })
    const inputFile = join(tmpdir(), `vertex-upload-${suffix}.jsonl`)
    const entityIdsFile = join(tmpdir(), `vertex-upload-${suffix}.csv`)
    let candidate = ''
    http.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'POST', path: /^\/upload\/storage\/v1\// })
      .reply(options => {
        candidate = new URL(options.path, 'https://storage.googleapis.com').searchParams
          .get('name')!
          .split('/')[1]!
        return { statusCode: 503, data: {} }
      })
    try {
      await writeFile(inputFile, '{}\n')
      await writeFile(entityIdsFile, `${topicId},${'ab'.repeat(32)}\n`)
      await http.run(async () => {
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
        ).rejects.toThrow('(503)')
      })
      const batchId = candidate
      expect(await getTestBatchEntities(batchId)).toEqual([])
      expect(await getTestBatchSummary(batchId)).toBeNull()
    } finally {
      await Promise.all([inputFile, entityIdsFile].map(path => rm(path, { force: true })))
    }
  })

  describe('with reserved creation quota', () => {
    let fixture: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>
    let http: ReturnType<typeof createVertexHttpFixture>
    beforeEach(async () => {
      http = createVertexHttpFixture()
      fixture = await acquireEmbeddingQuotaFixture()
    })

    it('cleans an unsubmitted candidate when quota changes during GCS upload', async () => {
      const restore = overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
        min_records_per_job: 1,
        max_requests_per_hour: 100,
        max_inflight_jobs: GEMINI_BATCH_MAX_VALUES.max_inflight_jobs,
        max_job_size_gb: GEMINI_BATCH_MAX_VALUES.max_job_size_gb,
      })
      const user = await createTestUserDirect()
      const suffix = randomUUID()
      const topicId = await insertTestTopic({ name: suffix, slug: suffix, createdById: user.id })
      fixture.beforeRelease(async () => {
        await hardDeleteTestTopic(topicId)
        await hardDeleteTestUser(user.id)
        restore()
      })
      const inputFile = join(tmpdir(), `vertex-quota-${suffix}.jsonl`)
      const entityIdsFile = join(tmpdir(), `vertex-quota-${suffix}.csv`)
      const uploadEntered = Promise.withResolvers<void>()
      const finishUpload = Promise.withResolvers<void>()
      let candidate = ''
      http.agent
        .get('https://storage.googleapis.com')
        .intercept({ method: 'POST', path: /^\/upload\/storage\/v1\// })
        .reply(async options => {
          candidate = new URL(options.path, 'https://storage.googleapis.com').searchParams
            .get('name')!
            .split('/')[1]!
          uploadEntered.resolve()
          await finishUpload.promise
          return { statusCode: 200, data: {} }
        })
        .persist()
      let pending: Promise<string> | undefined
      try {
        await writeFile(inputFile, '{}\n')
        await writeFile(entityIdsFile, `${topicId},${'ab'.repeat(32)}\n`)
        pending = http.run(() =>
          createBatch(
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
          ),
        )
        void pending.catch(uploadEntered.reject)
        await uploadEntered.promise
        const batchId = candidate
        await withEmbeddingQuotaSnapshot(async query => {
          const referenceTime = new Date()
          const includingCandidate = await getBatchRecordsCreatedInLastHour(referenceTime, {
            query,
          })
          const excludingCandidate = await getBatchRecordsCreatedInLastHour(
            referenceTime,
            { query },
            batchId,
          )
          expect(includingCandidate - excludingCandidate).toBe(1)
          const restoreExactCapacity = overrideDynamicConfigFieldsForTest(
            geminiEmbeddingsBatchConfig,
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
      } finally {
        finishUpload.resolve()
        await pending?.catch(() => undefined)
        await fixture.close()
        await Promise.all([inputFile, entityIdsFile].map(path => rm(path, { force: true })))
      }
    })
  })
})
