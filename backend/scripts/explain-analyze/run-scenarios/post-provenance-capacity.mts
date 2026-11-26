import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import {
  getPostProvenanceFacts,
  type PostProvenanceFacts,
} from '@services/content-provenance/post-facts'
import { paginationMaxima } from '@services/pagination/config'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import sql from 'sql-template-strings'
import { runAndCapture, seedUser } from '../run-support.mts'
import { contentHash } from '../seed-data/common.mts'
import { oauthClientVerificationSeedId } from '../seed-data/oauth-client-verification.mts'

async function seedPostProvenanceCapacity(
  fixtureId: string,
  limit: number,
  metadataClientId: string,
  metadataUrl: string,
) {
  const verifiedClientId = oauthClientVerificationSeedId(0)
  const { rows } = await read<{ verified_at: Date | null }>(sql`
    /* readPostProvenanceCapacityVerifiedAt */
    SELECT verified_at FROM oauth_clients WHERE id = ${verifiedClientId}
  `)
  const verifiedAt = rows[0]?.verified_at
  assert.ok(verifiedAt, 'The first seeded OAuth client must be verified')

  const kinds = [
    { clientId: null, facts: { created_via: 'system', client: null } },
    {
      clientId: verifiedClientId,
      facts: {
        created_via: 'api',
        client: {
          client_id: `voucha_${'0'.repeat(32)}`,
          client_name: 'EXPLAIN OAuth client 0',
          metadata_url: null,
          verified_at: verifiedAt,
        },
      },
    },
    {
      clientId: metadataClientId,
      facts: {
        created_via: 'mcp',
        client: {
          client_id: metadataUrl,
          client_name: 'Content provenance test client',
          metadata_url: metadataUrl,
          verified_at: null,
        },
      },
    },
    { clientId: null, facts: { created_via: 'api', client: null } },
  ] as const satisfies readonly { clientId: string | null; facts: PostProvenanceFacts }[]
  const posts = Array.from({ length: limit }, (_, index) => ({
    ...kinds[index % kinds.length]!,
    title: `EXPLAIN post provenance ${fixtureId} ${index}`,
  }))
  const hash = contentHash(fixtureId)
  const { rows: postRows } = await write<{ id: string; title: string }>(sql`
    /* seedPostProvenanceCapacityPosts */
    INSERT INTO posts (
      created_via, created_via_oauth_client_id, post_type, title, created_by_id,
      approved_at, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
    )
    SELECT channel, client_id, 'discussion', title, ${seedUser.id}, CURRENT_TIMESTAMP,
      ${hash}, ${hash}
    FROM unnest(
      ${posts.map(post => post.facts.created_via)}::content_creation_channels[],
      ${posts.map(post => post.clientId)}::uuid[],
      ${posts.map(post => post.title)}::text[]
    ) AS fixture(channel, client_id, title)
    RETURNING id, title
  `)
  return { postRows, posts }
}

export async function runPostProvenanceCapacityScenario(): Promise<void> {
  const limit = paginationMaxima.max_limit
  const fixtureId = randomUUID()
  const metadataUrl = `https://example.invalid/post-provenance/${fixtureId}.json`
  const metadataClientId = await insertContentProvenanceOAuthClient({ metadataUrl })
  let postIds: string[] = []
  try {
    const { postRows, posts } = await seedPostProvenanceCapacity(
      fixtureId,
      limit,
      metadataClientId,
      metadataUrl,
    )
    postIds = postRows.map(row => row.id)
    assert.equal(new Set(postIds).size, limit)
    const factsByTitle = new Map(posts.map(row => [row.title, row.facts]))
    const expected = new Map(postRows.map(row => [row.id, factsByTitle.get(row.title)]))
    await runAndCapture(
      'post-provenance-facts-at-cap',
      async () => {
        const facts = await getPostProvenanceFacts(postIds)
        assert.deepEqual(facts, expected)
      },
      undefined,
      'getPostProvenanceFacts',
      { exactCapturedNames: ['getPostProvenanceFacts'] },
    )
  } finally {
    await using query = await beginTransaction()
    if (postIds.length > 0)
      await query(sql`/* deletePostProvenanceCapacityPosts */
      DELETE FROM posts WHERE id = ANY(${postIds}::uuid[])`)
    await query(sql`/* deletePostProvenanceCapacityClients */
      DELETE FROM oauth_clients WHERE id = ${metadataClientId}`)
    await query.commit()
  }
}
