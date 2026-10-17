import type { Job } from 'glide-mq'
import { afterAll, describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { POST_MENTIONS_PROCESS_JOB } from '@queues/background/enqueues/post-mentions-jobs'
import { enqueuePostMentions } from '@queues/post-mentions/enqueues'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import {
  createTestUser,
  getMentionRowsForRelationTable,
  insertTestPost,
} from '@voucha/test-helpers'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

const worker = createBackgroundWorker({ handlers: BACKGROUND_HANDLERS, domains: ['post-mentions'] })

describe('post-mentions background handler', () => {
  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('processes an enqueued post under the namespaced job and records its mentions', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const author = await createTestUser()
    const mentioned = await createTestUser({ username: `mention-${random}` })
    const postId = await insertTestPost({
      title: `Hello @${mentioned.username}`,
      slug: `mention-host-${random}`,
      createdById: author.id,
      markdown: 'Body',
    })
    const completed = Promise.withResolvers<void>()
    worker.on('completed', job => {
      if (job.name === POST_MENTIONS_PROCESS_JOB.name && job.data.postId === postId) {
        completed.resolve()
      }
    })
    worker.on('failed', (job, error) => {
      if (job?.data?.postId === postId) completed.reject(error)
    })

    const job = (await enqueuePostMentions(postId)) as Job
    expect(job.name).toBe(POST_MENTIONS_PROCESS_JOB.name)
    expect(job.opts.priority).toBe(POST_MENTIONS_PROCESS_JOB.options.priority)
    expect(job.opts.ordering).toEqual({ key: 'post-mentions', concurrency: 5 })
    await completed.promise

    const relation = entityRelationMetadatum.find(
      r => r.subject_type === 'user' && r.object_type === 'post' && r.predicate === 'mentioned',
    )
    const rows = await getMentionRowsForRelationTable(relation!.table_name, postId)
    expect(rows.map(row => row.subject_id)).toEqual([mentioned.id])
  })

  it('lets a caller override the default priority', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: 'Priority override',
      slug: `priority-override-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Body',
    })
    const job = (await enqueuePostMentions(postId, 3)) as Job
    expect(job.opts.priority).toBe(3)
  })
})
