import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { getPostNotificationSnapshot } from '@services/notifications/reconcile-post-snapshot'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

export async function runNotificationPostSnapshotCapacity(): Promise<void> {
  const scenario = 'notification-post-reconciliation-snapshot'
  const now = Date.now()
  const [approved, unapproved, comment, missing] = Array.from({ length: 4 }, (_, index) =>
    seedUuidAtTimestamp(now, 5_750_000 + index),
  )
  const author = seedUuidAtTimestamp(now, 5_750_004)
  const username = `explain-notification-${now}`
  await using seed = await beginTransaction()
  await seed(sql`/* seedExplainPostSnapshotAuthor */ INSERT INTO users (id, username)
    VALUES (${author}, ${username})`)
  await seed(sql`/* seedExplainPostSnapshotRoots */
    INSERT INTO posts (id, post_type, title, markdown, created_by_id, created_via, approved_at,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT fixture.id, 'discussion', 'Snapshot root', 'Snapshot root', ${author}, 'system',
      CASE WHEN fixture.id = ${approved}::uuid THEN CURRENT_TIMESTAMP END,
      decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex')
    FROM unnest(${[approved, unapproved]}::uuid[]) fixture(id)`)
  await seed(sql`/* seedExplainPostSnapshotComment */
    INSERT INTO posts (id, post_type, title, markdown, created_by_id, created_via,
      parent_post_id, root_post_id, approved_at,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    VALUES (${comment}, 'comment', 'Snapshot comment', 'Snapshot comment', ${author}, 'system',
      ${approved}, ${approved}, CURRENT_TIMESTAMP,
      decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex'))`)
  await seed.commit()
  try {
    registerScenarioContract(scenario, {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'posts', max: 2 },
        { kind: 'maxProcessedRows', relation: 'users', max: 5 },
        { kind: 'maxProcessedRows', relation: 'post_slugs', max: 2 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const parent = await getPostNotificationSnapshot(approved)
        assert.equal(parent?.id, approved)
        assert.equal(parent.created_by_id, author)
        assert.equal(parent.root_post_id, null)
        assert.equal(parent.is_content_eligible, true)
        assert.equal(parent.is_manual_send_content_eligible, true)

        const reply = await getPostNotificationSnapshot(comment)
        assert.equal(reply?.id, comment)
        assert.equal(reply.parent_post_id, approved)
        assert.equal(reply.root_post_id, approved)
        assert.equal(reply.root_created_by_id, author)
        assert.equal(reply.is_content_eligible, true)
        assert.equal(reply.is_manual_send_content_eligible, false)

        const held = await getPostNotificationSnapshot(unapproved)
        assert.equal(held?.id, unapproved)
        assert.equal(held.is_content_eligible, false)
        assert.equal(held.is_manual_send_content_eligible, false)
        assert.equal(await getPostNotificationSnapshot(missing), null)
      },
      undefined,
      'getPostNotificationSnapshot',
    )
  } finally {
    await using cleanup = await beginTransaction()
    await cleanup(sql`/* cleanupExplainPostSnapshotPosts */
      DELETE FROM posts WHERE id = ANY(${[approved, unapproved, comment]}::uuid[])`)
    await cleanup(sql`/* cleanupExplainPostSnapshotIdentities */
      DELETE FROM retained_post_identities WHERE id = ANY(${[approved, unapproved, comment]}::uuid[])`)
    await cleanup(
      sql`/* cleanupExplainPostSnapshotAuthor */ DELETE FROM users WHERE id = ${author}`,
    )
    await cleanup(sql`/* cleanupExplainPostSnapshotAuthorIdentity */
      DELETE FROM retained_user_identities WHERE id = ${author}`)
    await cleanup.commit()
  }
}
