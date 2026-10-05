import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  entityRelationMetadatum,
  getEntityRelationIntegritySubjectColumn,
  getEntityRelationIntegrityTargetColumn,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { createLocalTestUser } from '../../../../test-helpers/data-stores/psql/users.mts'
import {
  createTopicForRelationPartitionTest,
  getPostSubjectTablePartitionKinds,
  getUserFollowTopicRelationsBySubjectIds,
  getUserFollowTopicRelationsByTopicIds,
  insertUserFollowTopicRelation,
} from '../../../../test-helpers/data-stores/psql/entity-relation-partitions.mts'
import generateEntityRelationsSql from '../0000-00-01-entity-relations.mts'

describe('user-subject entity relation tables', () => {
  it('stores a durable outbound Follow activity id only on user follow relations', () => {
    const sql = generateEntityRelationsSql()

    expect(sql).toContain('outbound_activitypub_follow_activity_id UUID DEFAULT uuidv7()')
    expect(
      sql.match(/outbound_activitypub_follow_activity_id UUID DEFAULT uuidv7\(\)/g),
    ).toHaveLength(1)
    expect(sql).not.toContain('ADD COLUMN outbound_activitypub_follow_activity_id')
  })

  it('generates a concrete vote table and composite relation foreign key per election table', () => {
    const sql = generateEntityRelationsSql()
    const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)

    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS entity_relation_votes')
    expect(sql).toContain('CREATE OR REPLACE VIEW view_entity_relation_votes AS')
    expect(sql).toContain('CREATE TYPE elected_entity_relations AS ENUM')
    expect(sql).toContain('entity_relation elected_entity_relations PRIMARY KEY')
    expect(sql).not.toContain('INSERT INTO retained_relation_identity_cleanup_cursors')
    for (const metadata of electionRelations) {
      const voteTable = getEntityRelationVoteTableName(metadata)
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${voteTable} (`)
      expect(sql).toContain(
        `FOREIGN KEY (subject_id, entity_relation_id) REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE CASCADE`,
      )
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${voteTable}__default`)
      expect(sql).toContain(`PARTITION OF ${voteTable} DEFAULT`)
    }
    expect(sql.match(/PARTITION BY RANGE \(entity_relation_id\)/g)).toHaveLength(
      electionRelations.length,
    )
    expect(sql).toContain('score_is_neutral BOOLEAN NOT NULL DEFAULT FALSE')
    expect(sql).toContain('score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE')
    expect(sql).toContain('UNIQUE (subject_id, id)')
    expect(sql).toContain('PRIMARY KEY (entity_relation_id, id)')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS relation__user__category__topic')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS relation__user__category__topic__votes')
    expect(sql).not.toContain('CREATE OR REPLACE VIEW entity_relation_votes AS')
  })

  it('generates concrete vote-integrity targets for every election relation', () => {
    const sql = generateEntityRelationsSql()
    const canonicalFlagsSql = readFileSync(
      new URL('../../migrations/0240-00-00-elections-vote-integrity.sql', import.meta.url),
      'utf8',
    )
    const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)

    for (const metadata of electionRelations) {
      const targetColumn = getEntityRelationIntegrityTargetColumn(metadata)
      const subjectColumn = getEntityRelationIntegritySubjectColumn(metadata)
      const shortName = metadata.table_name.replace(/^relation__/, '')

      expect(canonicalFlagsSql).toContain(`  ${targetColumn} UUID,`)
      expect(canonicalFlagsSql).toContain(`  ${subjectColumn} UUID,`)
      expect(sql).toContain(`COMMENT ON COLUMN vote_integrity_flags."${targetColumn}"`)
      expect(sql).toContain(`COMMENT ON COLUMN vote_integrity_flags."${subjectColumn}"`)
      expect(sql).toContain(
        `FOREIGN KEY (${subjectColumn}, ${targetColumn}) REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE CASCADE NOT VALID`,
      )
      expect(sql).toContain(`CHECK ((${subjectColumn} IS NULL) = (${targetColumn} IS NULL))`)
      expect(sql).toContain(`VALIDATE CONSTRAINT vif_${shortName}_target_fkey`)
    }
    const targetColumns = [
      'post_id',
      'topic_id',
      'hostname_id',
      'rss_feed_item_id',
      'agent_moderation_id',
      ...electionRelations.map(getEntityRelationIntegrityTargetColumn),
    ]
    expect(sql).toContain(`CHECK (num_nonnulls(${targetColumns.join(', ')}) = 1) NOT VALID`)
    expect(sql).toContain('VALIDATE CONSTRAINT chk_vote_integrity_flags__one_target')
    expect(sql).not.toContain('ADD COLUMN')
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
