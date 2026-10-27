import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { background } from '@queues/background/queues'
import { IMAGE_DELETION_RECOVER_JOB } from '@queues/background/enqueues/image-deletion-jobs'
import { readAllQueueJobs } from './queue-jobs.mts'
import { approveTestPost } from './entities/post-clearance.mts'
import { createTestUserDirect } from './entities/users-direct.mts'
import { getPostModerationResetState } from './entities/post-moderation.mts'
import { insertTestImage } from './entities/images-insert.mts'
import { insertTestPost } from './entities/posts.mts'
import { insertTestPostImage } from './entities/images-post-placements.mts'
import { markImageQuarantinePending } from './entities/image-safety.mts'
import { rejectQuery } from './injected-failures.mts'

/** Snapshot root admissions without counting scoped fixture or continuation jobs. */
export async function readImageDeletionRootRecoveryJobIds(): Promise<string[]> {
  return (await readAllQueueJobs(background))
    .flatMap(job => {
      const data = job.data as { imageIds?: readonly string[]; afterId?: string }
      return job.name === IMAGE_DELETION_RECOVER_JOB.name && !data.imageIds && !data.afterId
        ? [job.id]
        : []
    })
    .toSorted()
}

/** Identical post content makes paged and single-page deletion outcomes comparable. */
export async function createImageDeletionFixture(postCount = 3) {
  const user = await createTestUserDirect()
  const imageId = await insertTestImage(user!.id)
  const postIds: string[] = []
  for (const ordinal of Array.from({ length: postCount }, (_, ordinal) => ordinal)) {
    const postId = await insertTestPost({
      title: `Image deletion ${ordinal}`,
      slug: `image-deletion-${randomUUID()}`,
      markdown: 'A shared image is removed from this post.',
      createdById: user!.id,
      clearanceStatus: 'pending',
    })
    await insertTestPostImage({ postId, imageId, caption: 'Deleted shared image' })
    await approveTestPost(postId)
    postIds.push(postId)
  }
  return { imageId, postIds: postIds.toSorted() }
}

/** Fail a real page transaction before its post hash write, leaving rollback to PostgreSQL. */
export function failingImageDeletionTransaction() {
  return async (...args: Parameters<typeof beginTransaction>) =>
    rejectQuery(
      await beginTransaction(...args),
      statement => /UPDATE posts\s+SET llm_moderation_content_sha256/.test(statement),
      'injected middle deletion page failure',
    )
}

/** Simulate a lost listener admission acknowledgement after the page has already committed. */
export function failingImageDeletionAcknowledgement() {
  return async (...args: Parameters<typeof beginTransaction>) =>
    rejectQuery(
      await beginTransaction(...args),
      statement => statement.includes('DELETE FROM image_deletion_post_updates'),
      'injected deletion admission acknowledgement failure',
    )
}

/** Quarantine wins after entry lookup but before the deletion fence acquires its asset lock. */
export function quarantineBeforeImageDeletionTransaction(imageId: string) {
  let marked = false
  return async (...args: Parameters<typeof beginTransaction>) => {
    if (!marked) {
      await markImageQuarantinePending(imageId)
      marked = true
    }
    return beginTransaction(...args)
  }
}

/** Capture statements by transaction while preserving real commit and disposal behavior. */
export function captureImageDeletionTransactions() {
  const statements: string[][] = []
  const postScopeKeys: string[][] = []
  return {
    statements,
    postScopeKeys,
    beginTransaction: async (...args: Parameters<typeof beginTransaction>) => {
      const transaction = await beginTransaction(...args)
      const captured: string[] = []
      const scopes: string[] = []
      statements.push(captured)
      postScopeKeys.push(scopes)
      return new Proxy(transaction, {
        apply(target, thisArgument, argumentsList: Parameters<typeof transaction>) {
          const [input, parameters] = argumentsList
          captured.push(typeof input === 'string' ? input : input.text)
          const values = typeof input === 'string' ? (parameters ?? []) : input.values
          for (const value of values.flatMap(value => (Array.isArray(value) ? value : [value]))) {
            if (typeof value === 'string' && value.startsWith('media-delivery:post:'))
              scopes.push(value)
          }
          return Reflect.apply(target, thisArgument, argumentsList)
        },
      })
    },
  }
}

export async function readImageDeletionPostOutcome(postId: string) {
  const state = await getPostModerationResetState(postId)
  if (!state) throw new Error('Owned deletion fixture post disappeared')
  const { latest_clearance_change_id: _changeId, ...outcome } = state
  return outcome
}
