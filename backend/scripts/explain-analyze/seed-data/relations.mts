import { beginTransaction } from '@data-stores/psql'
import { seedUuid, seedRelationIdAfterPost, seedFreshRelationId } from './common.mts'

export async function seedEntityRelations(
  count = 5000,
  postCount = 100_000,
  positiveVotes = false,
): Promise<void> {
  console.log(`Seeding ${count} entity relations (post->topic category)...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 1000) {
      const batch = Math.min(1000, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const relationIndex = i + j
        const postIndex = relationIndex % postCount
        const postId = seedUuid(postIndex, '05')
        const topicId = seedUuid(
          (relationIndex + Math.floor(relationIndex / postCount)) % 2500,
          '04',
        )
        const userId = seedUuid(relationIndex % 20_000, '01')
        const relationId = seedRelationIdAfterPost(postIndex, relationIndex)
        values.push(
          relationId,
          postId,
          topicId,
          userId,
          positiveVotes ? 1 : 0,
          positiveVotes ? 1 : 0,
        )
        const base = values.length - 5
        rows.push(
          `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
        )
      }
      await query(
        `/* seedExplainData */ INSERT INTO relation__post__category__topic
           (id, subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}

// rss-feed-search-by-publisher-type needs a real relation__topic__publisher_type__topic row
// tagging some feed's topic (subject) with seedTopicId (object) as its publisher type. Feed
// index 0's topic_id IS seedTopicId itself (see feeds.mts), so index 1's feed is used as the
// subject to avoid a self-referential relation.
export async function seedPublisherTypeRelation(): Promise<void> {
  console.log('Seeding publisher-type relation...')
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO relation__topic__publisher_type__topic
         (id, subject_id, object_id, created_by_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [seedFreshRelationId(0), seedUuid(1, '04'), seedUuid(0, '04'), seedUuid(0, '01')],
    )

    await transaction.commit()
  }
}

export async function seedSavedPostRelations(count = 5000): Promise<void> {
  console.log(`Seeding ${count} saved-post pagination relations...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 1000) {
      const batch = Math.min(1000, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        values.push(seedUuid(0, '01'), seedUuid(i + j, '05'), seedUuid(0, '01'))
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO relation__user__save__post
           (subject_id, object_id, created_by_id)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}

export async function seedFollowPostRelations(count = 5000): Promise<void> {
  console.log(`Seeding ${count} followed-post relations...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 1000) {
      const batch = Math.min(1000, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const index = i + j
        const userId = seedUuid(index % 20_000, '01')
        values.push(userId, seedUuid(index, '05'), userId)
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO relation__user__follow__post
           (subject_id, object_id, created_by_id)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}

export async function seedFollowRelations(count = 2000): Promise<void> {
  console.log(`Seeding ${count} follow relations...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const values: unknown[] = []
    const rows: string[] = []
    for (let i = 0; i < count; i++) {
      const subjectId = seedUuid(i % 20_000, '01')
      const objectId = seedUuid((i + 1) % 20_000, '01')
      if (subjectId === objectId) continue
      const userId = subjectId
      values.push(subjectId, objectId, userId)
      const base = values.length - 2
      rows.push(`($${base}, $${base + 1}, $${base + 2})`)
    }
    if (rows.length > 0) {
      await query(
        `/* seedExplainData */ INSERT INTO relation__user__follow__user (subject_id, object_id, created_by_id)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedMuteBlockRelations(count = 1000): Promise<void> {
  console.log(`Seeding ${count} mute/block relations...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const muteValues: unknown[] = []
    const muteRows: string[] = []
    const blockValues: unknown[] = []
    const blockRows: string[] = []
    for (let i = 0; i < count; i++) {
      const subjectId = seedUuid(i % 20_000, '01')
      const objectId = seedUuid((i + 5000) % 20_000, '01')
      if (subjectId === objectId) continue
      if (i < count / 2) {
        muteValues.push(subjectId, objectId, subjectId)
        const base = muteValues.length - 2
        muteRows.push(`($${base}, $${base + 1}, $${base + 2})`)
      } else {
        blockValues.push(subjectId, objectId, subjectId)
        const base = blockValues.length - 2
        blockRows.push(`($${base}, $${base + 1}, $${base + 2})`)
      }
    }
    if (muteRows.length > 0) {
      await query(
        `/* seedExplainData */ INSERT INTO relation__user__mute__user (subject_id, object_id, created_by_id)
         VALUES ${muteRows.join(', ')} ON CONFLICT DO NOTHING`,
        muteValues,
      )
    }
    if (blockRows.length > 0) {
      await query(
        `/* seedExplainData */ INSERT INTO relation__user__block__user (subject_id, object_id, created_by_id)
         VALUES ${blockRows.join(', ')} ON CONFLICT DO NOTHING`,
        blockValues,
      )
    }

    await transaction.commit()
  }
}
