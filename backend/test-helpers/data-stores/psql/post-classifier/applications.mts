import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestPost, createTestTopic } from '../../../entities/create-test-entities.mts'
import { insertTestCommunity } from '../../../entities/communities.mts'
import { createTestUser } from '../../../entities/users.mts'
import { retainPublicationIdentityBridges } from '../../../../services/post-publication/identity-bridges.mts'
import { buildPostClassifierApplicationLifecycleOperations } from './application-lifecycle-operations.mts'

type ApplicationRow = {
  id: string
  post_id: string
  community_identity_id: string | null
  decision_batch_id: string | null
  provider_attempts_started: number
  lease_token: string | null
  outcomes_persisted_at: Date | null
  votes_applied_at: Date | null
  tags_applied_at: Date | null
  completed_at: Date | null
}

export async function createPostClassifierApplicationFixture(options?: {
  community?: boolean
  postId?: string
  decisionBatchId?: string
}) {
  const actor = await createTestUser()
  const author = await createTestUser()
  const community = options?.community
    ? await insertTestCommunity({ createdById: author.id })
    : null
  const post = options?.postId
    ? { id: options.postId }
    : await createTestPost({ user: author, community_id: community?.id })
  const localTopic = await createTestTopic({
    user: author,
    name: `Local classifier ${randomUUID()}`,
  })
  const decisionBatchId = options?.decisionBatchId ?? null
  const configuration = JSON.stringify({
    fixture: randomUUID(),
    detectorPackageVersion: 'test-fixture-package-0.4.3',
  })
  const inputHash = Buffer.alloc(32, 1)
  await using transaction = await beginTransaction()
  if (community) await retainPublicationIdentityBridges(transaction, 'community', [community.id])
  const { rows } = await transaction<{
    id: string
  }>(sql`/* createPostClassifierApplicationFixture */
      INSERT INTO post_classifier_applications (
        post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id,
        community_identity_id, detector_package_version, local_topic_id, decision_batch_id
      ) VALUES (
        ${post.id}, ${inputHash}, ${configuration}::jsonb,
        digest(${configuration}::jsonb::text, 'sha256'),
        ${actor.id}, ${community?.id ?? null}, 'test-fixture-package-0.4.3', ${localTopic.id},
        ${decisionBatchId}
      ) RETURNING id
    `)
  await transaction.commit()
  const id = rows[0]!.id

  return {
    id,
    postId: post.id,
    actorId: actor.id,
    communityId: community?.id ?? null,
    localTopicId: localTopic.id,
    decisionBatchId,
    read: async () => {
      const result = await read<ApplicationRow>(sql`/* readPostClassifierApplicationFixture */
        SELECT id, post_id, community_identity_id, decision_batch_id,
          provider_attempts_started, lease_token, outcomes_persisted_at, votes_applied_at,
          tags_applied_at, completed_at
        FROM post_classifier_applications WHERE post_id = ${post.id} AND id = ${id}
      `)
      return result.rows[0]
    },
    duplicate: () =>
      write(sql`/* duplicatePostClassifierApplicationFixture */
      INSERT INTO post_classifier_applications (
        post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id,
        detector_package_version, local_topic_id
      ) VALUES (
        ${post.id}, ${inputHash}, ${configuration}::jsonb,
        digest(${configuration}::jsonb::text, 'sha256'),
        ${actor.id}, 'test-fixture-package-0.4.3', ${localTopic.id}
      )
      `),
    invalidConfigurationJson: () =>
      write(sql`/* invalidPostClassifierApplicationConfigurationJson */
        INSERT INTO post_classifier_applications (
          post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id,
          detector_package_version
        ) VALUES (
          ${post.id}, ${inputHash}, 'not-json', digest('not-json', 'sha256'), ${actor.id},
          'test-fixture-package-0.4.3'
        )
      `),
    invalidDetectorPackageVersion: () =>
      insertInvalidPostClassifierApplication({
        postId: post.id,
        actorId: actor.id,
        detectorPackageVersion: '',
        localTopicId: localTopic.id,
      }),
    invalidEmptyClassifierIdentity: () =>
      insertInvalidPostClassifierApplication({
        postId: post.id,
        actorId: actor.id,
        detectorPackageVersion: 'test-fixture-package-0.4.3',
        localTopicId: null,
      }),
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
      UPDATE post_classifier_applications SET community_identity_id = ${randomUUID()}
      WHERE post_id = ${post.id} AND id = ${id}
    `),
    setInvalidDecisionBatch: () =>
      write(sql`/* setInvalidCommittedBatchPostClassifierApplicationFixture */
      UPDATE post_classifier_applications SET decision_batch_id = ${randomUUID()}
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

function insertInvalidPostClassifierApplication(input: {
  postId: string
  actorId: string
  detectorPackageVersion: string
  localTopicId: string | null
}) {
  const configuration = JSON.stringify({ fixture: randomUUID() })
  return write(sql`/* insertInvalidPostClassifierApplication */
    INSERT INTO post_classifier_applications (
      post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id,
      detector_package_version, local_topic_id
    ) VALUES (
      ${input.postId}, ${Buffer.alloc(32, 4)}, ${configuration}::jsonb,
      digest(${configuration}::jsonb::text, 'sha256'), ${input.actorId}, ${input.detectorPackageVersion},
      ${input.localTopicId}
    )
  `)
}
