import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestPost } from '../../../entities/create-test-entities.mts'
import { insertTestCommunity } from '../../../entities/communities.mts'
import { createTestUser } from '../../../entities/users.mts'
import { buildPostClassifierApplicationLifecycleOperations } from './application-lifecycle-operations.mts'

type ApplicationRow = {
  id: string
  post_id: string
  community_id: string | null
  reserved_batch_id: string | null
  committed_batch_id: string | null
  provider_attempts_started: number
  lease_token: string | null
  outcomes_persisted_at: Date | null
  votes_applied_at: Date | null
  tags_applied_at: Date | null
  completed_at: Date | null
}

export async function createPostClassifierApplicationFixture(options?: {
  community?: boolean
  remote?: boolean
  postId?: string
  reservedBatchId?: string
}) {
  const actor = await createTestUser()
  const author = await createTestUser()
  const community = options?.community
    ? await insertTestCommunity({ createdById: author.id })
    : null
  const post = options?.postId
    ? { id: options.postId }
    : await createTestPost({ user: author, community_id: community?.id })
  const reservedBatchId = options?.reservedBatchId ?? (options?.remote ? randomUUID() : null)
  const configuration = JSON.stringify({
    fixture: randomUUID(),
    detectorPackageVersion: 'test-fixture-package-0.4.3',
  })
  const inputHash = Buffer.alloc(32, 1)
  const { rows } = await write<{
    id: string
  }>(sql`/* createPostClassifierApplicationFixture */
    INSERT INTO post_classifier_applications (
      post_id, input_sha256, configuration_json, configuration_sha256,
      shared_actor_id, community_id, reserved_batch_id
    ) VALUES (
      ${post.id}, ${inputHash}, ${configuration}, digest(${configuration}, 'sha256'),
      ${actor.id}, ${community?.id ?? null}, ${reservedBatchId}
    ) RETURNING id
  `)
  const id = rows[0]!.id

  return {
    id,
    postId: post.id,
    actorId: actor.id,
    communityId: community?.id ?? null,
    reservedBatchId,
    read: async () => {
      const result = await read<ApplicationRow>(sql`/* readPostClassifierApplicationFixture */
        SELECT id, post_id, community_id, reserved_batch_id, committed_batch_id,
          provider_attempts_started, lease_token, outcomes_persisted_at, votes_applied_at,
          tags_applied_at, completed_at
        FROM post_classifier_applications WHERE post_id = ${post.id} AND id = ${id}
      `)
      return result.rows[0]
    },
    duplicate: () =>
      write(sql`/* duplicatePostClassifierApplicationFixture */
      INSERT INTO post_classifier_applications (
        post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id
      ) VALUES (
        ${post.id}, ${inputHash}, ${configuration}, digest(${configuration}, 'sha256'), ${actor.id}
      )
      `),
    invalidConfigurationJson: () =>
      write(sql`/* invalidPostClassifierApplicationConfigurationJson */
        INSERT INTO post_classifier_applications (
          post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id
        ) VALUES (
          ${post.id}, ${inputHash}, 'not-json', digest('not-json', 'sha256'), ${actor.id}
        )
      `),
    wrongHash: () =>
      write(sql`/* wrongHashPostClassifierApplicationFixture */
      UPDATE post_classifier_applications SET configuration_sha256 = ${Buffer.alloc(32, 2)}
      WHERE post_id = ${post.id} AND id = ${id}
      `),
    mutateInputHash: () =>
      write(sql`/* mutatePostClassifierApplicationInputHash */
        UPDATE post_classifier_applications SET input_sha256 = ${Buffer.alloc(32, 3)}
        WHERE post_id = ${post.id} AND id = ${id}
      `),
    mutateActor: () =>
      write(sql`/* mutateActorPostClassifierApplicationFixture */
      UPDATE post_classifier_applications SET shared_actor_id = ${randomUUID()}
      WHERE post_id = ${post.id} AND id = ${id}
    `),
    mutateCommunity: () =>
      write(sql`/* mutateCommunityPostClassifierApplicationFixture */
      UPDATE post_classifier_applications SET community_id = ${randomUUID()}
      WHERE post_id = ${post.id} AND id = ${id}
    `),
    setInvalidCommittedBatch: () =>
      write(sql`/* setInvalidCommittedBatchPostClassifierApplicationFixture */
      UPDATE post_classifier_applications SET committed_batch_id = ${randomUUID()}
      WHERE post_id = ${post.id} AND id = ${id}
    `),
    commitBatch: (batchId: string) =>
      write(sql`/* commitPostClassifierApplicationBatch */
      UPDATE post_classifier_applications SET committed_batch_id = ${batchId}
      WHERE post_id = ${post.id} AND id = ${id}
    `),
    deleteActor: () =>
      write(sql`/* deletePostClassifierApplicationActor */
      DELETE FROM users WHERE id = ${actor.id}
    `),
    dispose: () =>
      write(sql`/* disposePostClassifierApplicationFixture */
        DELETE FROM post_classifier_applications
        WHERE post_id = ${post.id} AND id = ${id}
      `),
    ...buildPostClassifierApplicationLifecycleOperations({ id, postId: post.id }),
  }
}
