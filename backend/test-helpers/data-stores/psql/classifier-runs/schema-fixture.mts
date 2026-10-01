import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { retainPublicationIdentityBridges } from '../../../../services/post-publication/identity-bridges.mts'
import { insertTestCommunity } from '../../../entities/communities.mts'
import { createTestPost } from '../../../entities/create-test-entities.mts'
import { createTestUser } from '../../../entities/users.mts'

/** Columns a schema test may assign directly, to prove the guards reject the wrong moves. */
export type ClassifierRunColumn =
  | 'classifier_id'
  | 'post_id'
  | 'rss_feed_item_id'
  | 'input_sha256'
  | 'configuration_sha256'
  | 'shared_actor_id'
  | 'community_identity_id'
  | 'decision_batch_id'
  | 'provider_attempts_started'
  | 'sweep_enqueue_count'
  | 'terminal_failure_kind'
  | 'terminal_failed_at'
  | 'lease_token'
  | 'leased_at'
  | 'lease_expires_at'
  | 'outcomes_persisted_at'
  | 'completed_at'
  | 'superseded_at'

export type ClassifierRunInsert = {
  postId?: string | null
  rssFeedItemId?: string | null
  inputSha256?: Buffer
  configurationJson?: string
  configurationSha256?: Buffer | null
  decisionBatchId?: string | null
  classifierId?: string
}

/**
 * A raw `classifier_runs` row for schema tests. It bypasses the lifecycle service on purpose, so
 * the constraints and guards are proved on their own.
 */
export async function createClassifierRunSchemaFixture(options: {
  classifierId: string
  postId?: string
  rssFeedItemId?: string
  decisionBatchId?: string
  community?: boolean
}) {
  const actor = await createTestUser()
  const author = await createTestUser()
  const community = options.community ? await insertTestCommunity({ createdById: author.id }) : null
  const subject = options.rssFeedItemId
    ? { postId: null, rssFeedItemId: options.rssFeedItemId }
    : {
        postId:
          options.postId ??
          (await createTestPost({ user: author, community_id: community?.id })).id,
        rssFeedItemId: null,
      }
  const configurationJson = JSON.stringify({ fixture: randomUUID() })
  const inputSha256 = Buffer.alloc(32, 1)

  async function insertRun(input: ClassifierRunInsert = {}) {
    const json = input.configurationJson ?? configurationJson
    const inserted = await insertClassifierRunRow({
      classifierId: input.classifierId ?? options.classifierId,
      postId: input.postId === undefined ? subject.postId : input.postId,
      rssFeedItemId:
        input.rssFeedItemId === undefined ? subject.rssFeedItemId : input.rssFeedItemId,
      inputSha256: input.inputSha256 ?? inputSha256,
      configurationJson: json,
      configurationSha256: input.configurationSha256,
      actorId: actor.id,
      decisionBatchId: input.decisionBatchId === undefined ? null : input.decisionBatchId,
      communityId: community?.id ?? null,
    })
    return inserted
  }

  const id = await insertRun({ decisionBatchId: options.decisionBatchId ?? null })
  const identity = { id, postId: subject.postId, rssFeedItemId: subject.rssFeedItemId }
  return {
    ...identity,
    actorId: actor.id,
    communityId: community?.id ?? null,
    inputSha256,
    configurationJson,
    insertRun,
    read: async () =>
      (
        await read<Record<string, unknown> & { community_identity_id: string | null }>(sql`
          /* readClassifierRunSchemaFixture */
          SELECT * FROM classifier_runs WHERE id = ${id}
        `)
      ).rows[0],
    update(assignments: Partial<Record<ClassifierRunColumn, unknown>>) {
      const entries = Object.entries(assignments)
      const statement = sql`/* updateClassifierRunSchemaFixture */ UPDATE classifier_runs SET `
      entries.forEach(([column, value], index) => {
        statement.append(index === 0 ? column : `, ${column}`).append(sql` = ${value}`)
      })
      return write(statement.append(sql` WHERE id = ${id}`))
    },
    deleteActor: () =>
      write(sql`/* deleteClassifierRunSchemaActor */ DELETE FROM users WHERE id = ${actor.id}`),
    dispose: () =>
      write(
        sql`/* disposeClassifierRunSchemaFixture */ DELETE FROM classifier_runs WHERE id = ${id}`,
      ),
  }
}

async function insertClassifierRunRow(input: {
  classifierId: string
  postId: string | null
  rssFeedItemId: string | null
  inputSha256: Buffer
  configurationJson: string
  configurationSha256: Buffer | null | undefined
  actorId: string
  decisionBatchId: string | null
  communityId: string | null
}): Promise<string> {
  await using transaction = await beginTransaction()
  if (input.communityId) {
    await retainPublicationIdentityBridges(transaction, 'community', [input.communityId])
  }
  const { rows } = await transaction<{ id: string }>(sql`/* insertClassifierRunSchemaRow */
    INSERT INTO classifier_runs (
      classifier_id, post_id, rss_feed_item_id, input_sha256, configuration_json,
      configuration_sha256, shared_actor_id, decision_batch_id
    ) VALUES (
      ${input.classifierId}, ${input.postId}, ${input.rssFeedItemId}, ${input.inputSha256},
      ${input.configurationJson}::jsonb,
      COALESCE(${input.configurationSha256 ?? null}::bytea,
        digest(${input.configurationJson}::jsonb::text, 'sha256')),
      ${input.actorId}, ${input.decisionBatchId}
    ) RETURNING id
  `)
  await transaction.commit()
  return rows[0]!.id
}
