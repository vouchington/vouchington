import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getPostRelatedUrlIds } from '@services/posts/create/source-url-relation'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { contentHash } from '../seed-data/common.mts'

// Default post_related_url limit in entity-relations/relation-limits-config.mts.
const ACTIVE_LINKS = 1_000

export async function runPostCreatedRecoveryCapacity(): Promise<void> {
  const fixture = await seedRecoveryLinks()
  try {
    await write('/* analyzePostCreatedRecoveryCapacity */ ANALYZE relation__post__related__url')
    const scenario = 'post-created-recovery-related-urls-at-cap'
    const queryName = 'getPostRelatedUrlIds'
    registerScenarioContract(scenario, {
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'relation__post__related__url',
          max: ACTIVE_LINKS,
        },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        assert.equal(fixture.activeUrls.length, ACTIVE_LINKS)
        const urlIds = await getPostRelatedUrlIds(fixture.postId, { readOnly: false })
        assert.deepEqual(urlIds.toSorted(), fixture.activeUrls)
      },
      undefined,
      queryName,
      { exactCapturedNames: [queryName] },
    )
  } finally {
    await using cleanup = await beginTransaction()
    await cleanup(sql`/* cleanupPostCreatedRecoveryStories */
      DELETE FROM posts WHERE id = ANY(${fixture.postIds}::uuid[])`)
    await cleanup(sql`/* cleanupPostCreatedRecoveryUrls */
      DELETE FROM urls WHERE hostname_id = ${fixture.hostnameId}`)
    await cleanup(sql`/* cleanupPostCreatedRecoveryHostname */
      DELETE FROM url_hostnames WHERE id = ${fixture.hostnameId}`)
    await cleanup.commit()
    await write(
      '/* analyzePostCreatedRecoveryCapacityCleanup */ ANALYZE relation__post__related__url',
    )
  }
}

async function seedRecoveryLinks() {
  await using query = await beginTransaction()
  const hostname = `story-recovery-${randomUUID()}.example.com`
  const { rows: hostnames } = await query<{ id: string }>(sql`
    /* seedPostCreatedRecoveryHostname */
    INSERT INTO url_hostnames (hostname) VALUES (${hostname}) RETURNING id`)
  const hostnameId = hostnames[0]!.id
  const { rows: urls } = await query<{ id: string; url: string }>(sql`
    /* seedPostCreatedRecoveryUrls */
    INSERT INTO urls (url, hostname_id, search_params)
    SELECT 'https://' || ${hostname} || '/' || n, ${hostnameId}, '{}'::jsonb
    FROM generate_series(1, ${ACTIVE_LINKS * 3}) n
    RETURNING id, url`)
  const urlIds = urls
    .toSorted((a, b) => Number(a.url.split('/').at(-1)) - Number(b.url.split('/').at(-1)))
    .map(row => row.id)
  const hash = contentHash('post-created-recovery-capacity')
  const { rows: posts } = await query<{ id: string }>(sql`
    /* seedPostCreatedRecoveryStories */
    INSERT INTO posts (created_via, post_type, title, markdown, created_by_id, approved_at,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT 'system', 'story', 'Recovery story ' || n, '', ${seedUser.id}, CURRENT_TIMESTAMP, ${hash}, ${hash}
    FROM generate_series(1, 2) n RETURNING id`)
  const postIds = posts.map(row => row.id)
  const postId = postIds[0]!
  await query(sql`
    /* seedPostCreatedRecoveryLinks */
    INSERT INTO relation__post__related__url
      (subject_id, object_id, created_by_id, votes_score_up, votes_count_up, deleted_at)
    SELECT CASE WHEN n <= ${ACTIVE_LINKS * 2} THEN ${postId}::uuid ELSE ${postIds[1]}::uuid END,
      url_id, ${seedUser.id},
      CASE WHEN n > ${ACTIVE_LINKS} AND n <= ${ACTIVE_LINKS * 2} AND n % 2 = 0 THEN 0 ELSE 1 END,
      CASE WHEN n > ${ACTIVE_LINKS} AND n <= ${ACTIVE_LINKS * 2} AND n % 2 = 0 THEN 0 ELSE 1 END,
      CASE WHEN n > ${ACTIVE_LINKS} AND n <= ${ACTIVE_LINKS * 2} AND n % 2 = 1 THEN CURRENT_TIMESTAMP END
    FROM unnest(${urlIds}::uuid[]) WITH ORDINALITY AS fixture(url_id, n)`)
  await query.commit()
  return { postId, postIds, hostnameId, activeUrls: urlIds.slice(0, ACTIVE_LINKS).toSorted() }
}
