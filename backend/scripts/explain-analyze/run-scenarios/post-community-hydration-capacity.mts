import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getPostCommunitiesRecord } from '@services/communities/post-communities-record'
import { paginationMaxima } from '@services/pagination/config'
import sql from 'sql-template-strings'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runPostCommunityHydrationCapacityScenario(): Promise<void> {
  // Each returned feed post can reference a different community. The common corpus already
  // includes 20,000 unrelated non-list communities and the seeded users used as creators here.
  const limit = paginationMaxima.max_limit
  const slugPrefix = `explain-post-hydration-${randomUUID()}`
  const expectedFields = Array.from({ length: limit }, (_, index) => ({
    name: `Explain post hydration ${index + 1}`,
    slug: `${slugPrefix}-${index + 1}`,
    creatorId: seedUuid(1000 + index, '01'),
  }))
  const { rows } = await write<{ id: string; slug: string }>(sql`
    /* seedPostCommunityHydrationCapacity */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    SELECT name, slug, creator_id, 'system'
    FROM unnest(
      ${expectedFields.map(row => row.name)}::text[],
      ${expectedFields.map(row => row.slug)}::text[],
      ${expectedFields.map(row => row.creatorId)}::uuid[]
    ) AS fixture(name, slug, creator_id)
    RETURNING id, slug
  `)
  const ids = rows.map(row => row.id)

  try {
    const idsBySlug = new Map(rows.map(row => [row.slug, row.id]))
    assert.equal(idsBySlug.size, limit)
    assert.equal(new Set(ids).size, limit)
    const communities = expectedFields.map(({ name, slug }) => {
      const id = idsBySlug.get(slug)
      assert.ok(id)
      return { id, name, slug }
    })
    await runAndCapture(
      'post-communities-batch-at-cap',
      async () => {
        const record = await getPostCommunitiesRecord(
          ids.toReversed().map(communityId => ({ community_id: communityId })),
        )
        assert.deepEqual(record, Object.fromEntries(communities.map(row => [row.id, row])))
      },
      undefined,
      'getCommunitiesByIdBatch',
      { exactCapturedNames: ['getCommunitiesByIdBatch'] },
    )
  } finally {
    await write(sql`/* deletePostCommunityHydrationCapacity */
      DELETE FROM communities WHERE id = ANY(${ids}::uuid[])`)
  }
}
