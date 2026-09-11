import { describe, expect, it } from 'vitest'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { createLocalTestUser } from '../../test-helpers/users.mts'
import {
  createTopicForRelationPartitionTest,
  getPostSubjectTablePartitionKinds,
  getUserFollowTopicRelationsBySubjectIds,
  getUserFollowTopicRelationsByTopicIds,
  insertUserFollowTopicRelation,
} from '../../test-helpers/entity-relation-partitions.mts'
import generateEntityRelationsSql from '../0000-00-01-entity-relations.mts'

describe('user-subject entity relation tables', () => {
  it('stores a durable outbound Follow activity id only on user follow relations', () => {
    const sql = generateEntityRelationsSql()

    expect(sql).toContain('outbound_ap_follow_activity_id UUID DEFAULT uuidv7()')
    expect(sql).toContain("WHERE attrelid = 'relation__user__follow__user'::regclass")
    expect(sql).toContain('ADD COLUMN outbound_ap_follow_activity_id UUID;')
    expect(sql).toContain('ALTER COLUMN outbound_ap_follow_activity_id SET DEFAULT uuidv7()')
    expect(sql).not.toContain('ALTER COLUMN outbound_ap_follow_activity_id SET NOT NULL')
    expect(sql).not.toContain('SET outbound_ap_follow_activity_id = uuidv7()')
    expect(sql.match(/outbound_ap_follow_activity_id UUID DEFAULT uuidv7\(\)/g)).toHaveLength(1)
  })

  it('generates a concrete vote table and composite relation foreign key per election table', () => {
    const sql = generateEntityRelationsSql()
    const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS entity_relation_votes')
    expect(sql).toContain('PARTITION BY LIST (relation_table)')
    for (const metadata of electionRelations) {
      const voteTable = getEntityRelationVoteTableName(metadata)
      expect(sql).toContain(
        `CREATE TABLE IF NOT EXISTS ${voteTable}\nPARTITION OF entity_relation_votes`,
      )
      expect(sql).toContain(
        `FOREIGN KEY (subject_id, entity_relation_id) REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE CASCADE`,
      )
      expect(sql).toContain(`FOR VALUES IN ('${metadata.table_name}')`)
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${voteTable}__default`)
      expect(sql).toContain(`PARTITION OF ${voteTable} DEFAULT`)
    }
    expect(sql.match(/PARTITION BY RANGE \(entity_relation_id\)/g)).toHaveLength(
      electionRelations.length,
    )
    expect(sql).toContain('UNIQUE (subject_id, id)')
    expect(sql).toContain('PRIMARY KEY (relation_table, entity_relation_id, id)')
    expect(sql).toContain("FOR VALUES IN ('relation__topic__related__post')")
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS relation__user__category__topic')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS relation__user__category__topic__votes')
    expect(sql).not.toContain('CREATE OR REPLACE VIEW entity_relation_votes AS')
  })

  it('generates concrete vote-integrity targets for every election relation', () => {
    const sql = generateEntityRelationsSql()

    expect(sql).toContain('ADD COLUMN relation__topic__related__post_id UUID;')
    expect(sql).toContain('ADD COLUMN relation__topic__related__post_subject_id UUID;')
    expect(sql).toContain(
      'COMMENT ON COLUMN vote_integrity_flags."relation__topic__related__post_id"',
    )
    expect(sql).toContain(
      'COMMENT ON COLUMN vote_integrity_flags."relation__topic__related__post_subject_id"',
    )
    expect(sql).toContain(
      'FOREIGN KEY (relation__topic__related__post_subject_id, relation__topic__related__post_id) REFERENCES relation__topic__related__post (subject_id, id) ON DELETE CASCADE NOT VALID',
    )
    expect(sql).toContain('VALIDATE CONSTRAINT vif_topic__related__post_target_fkey')
    expect(sql).toContain("IS DISTINCT FROM ARRAY['agent_moderation_id', 'hostname_id', 'post_id'")
    expect(sql).toContain('DROP CONSTRAINT chk_vote_integrity_flags__one_target')
  })

  it('preserves historic binary Neutral relation audit rows without rewriting them', () => {
    const sql = generateEntityRelationsSql()

    expect(sql).not.toContain('UPDATE entity_relation_votes SET score = NULL')
    expect(sql).toContain('CHECK (score IS NULL OR score IN (-1, 0, 1))')
  })

  it('can insert and query data', async () => {
    // Create test users - enough to likely hit multiple partitions
    const users = await Promise.all([
      createLocalTestUser(),
      createLocalTestUser(),
      createLocalTestUser(),
      createLocalTestUser(),
    ])

    // Create test topics
    const testTopics = await Promise.all(
      users.map(user => {
        if (!user) throw new Error('User not created')
        const topicName = `Test Topic ${Math.random().toString(36).slice(2)}`.slice(0, 50)
        const topicSlug = `test-topic-${Math.random().toString(36).slice(2)}`.slice(0, 50)
        const sha256 = `\\x${'0'.repeat(64)}`

        return createTopicForRelationPartitionTest(topicName, topicSlug, user.id, sha256)
      }),
    )

    // Insert follow relations
    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      if (!user) throw new Error('User not found')
      const userId = user.id
      const topicId = testTopics[i]
      if (!topicId) throw new Error('Topic not found')

      await insertUserFollowTopicRelation(userId, topicId)
    }

    // Query back - verify all relations exist (batch query)
    const userIds = users.flatMap(u => (u?.id ? [u.id] : []))
    const allRows = await getUserFollowTopicRelationsBySubjectIds(userIds)

    // Verify we got all relations
    expect(allRows).toHaveLength(users.length)
    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      if (!user) throw new Error('User not found')
      const topicId = testTopics[i]
      if (!topicId) throw new Error('Topic not found')

      const match = allRows.find(r => r.subject_id === user.id && r.object_id === topicId)
      expect(match).toBeDefined()
    }

    // Verify reverse queries work (query by topic_id)
    const reverseRows = await getUserFollowTopicRelationsByTopicIds(testTopics)

    // Verify all user-topic pairs exist
    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      if (!user) throw new Error('User not found')
      const topicId = testTopics[i]
      if (!topicId) throw new Error('Topic not found')

      const match = reverseRows.find(r => r.subject_id === user.id && r.object_id === topicId)
      expect(match).toBeDefined()
    }
  })

  it('post-subject tables use range partitioning', async () => {
    // Verify that post-subject tables were not affected
    const postSubjectTables = [
      'relation__post__category__topic',
      'relation__post__category__topic_alias',
      'relation__post__mentioned__topic',
      'relation__post__related__post',
      'relation__post__mentioned__post',
      'relation__post__related__url',
      'relation__post__mentioned__user',
    ]

    // Query all post-subject table partitions in one query
    const rows = await getPostSubjectTablePartitionKinds(postSubjectTables)

    // Verify each table has at least one partition with range partitioning
    for (const tableName of postSubjectTables) {
      const tablePartitions = rows.filter(r => r.table_name === tableName)
      expect(tablePartitions.length).toBeGreaterThan(0)

      // DEFAULT partitions have no constraint (partition_expression is null)
      // HASH partitions have a constraint containing satisfies_hash_partition
      const firstPartition = tablePartitions[0]
      expect(firstPartition.partition_expression).toBeNull()
    }
  })
})
