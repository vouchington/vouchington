import { describe, expect, it } from 'vitest'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { topicMergeRelationScratchNames } from '@voucha/types/entities/topic-merge-relation-scratch'
import generateTopicMergeRelationWorkItemsSql from '../0000-00-01d-topic-merge-relation-work-items.mts'

describe('topic merge elected relation parent mappings', () => {
  it('references retained original parents, live destinations, and indexed ballot owners for every topic election relation', () => {
    const sql = generateTopicMergeRelationWorkItemsSql()
    const topicElections = entityRelationMetadatum.filter(
      metadata =>
        metadata.election &&
        (metadata.subject_type === 'topic' || metadata.object_type === 'topic'),
    )

    expect(topicElections.map(metadata => metadata.table_name)).toContain(
      'relation__topic__related__topic',
    )
    expect(topicElections.map(metadata => metadata.table_name)).toContain(
      'relation__user__category__topic',
    )
    expect(
      sql.match(/^CREATE TABLE IF NOT EXISTS topic_merge_\w+_(?:parent_mappings|vote_owners) \(/gm),
    ).toHaveLength(topicElections.length * 2)

    for (const metadata of topicElections) {
      const { mappings, owners: voteOwners } = topicMergeRelationScratchNames(metadata)

      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${mappings} (`)
      expect(sql).toContain(
        `FOREIGN KEY (old_subject_id, old_relation_id)\n    REFERENCES retained_${metadata.table_name} (subject_id, id) ON DELETE RESTRICT`,
      )
      expect(sql).toContain(
        `FOREIGN KEY (next_subject_id, next_relation_id)\n    REFERENCES ${metadata.table_name} (subject_id, id) ON DELETE RESTRICT`,
      )
      expect(sql).toContain('CHECK ((next_subject_id IS NULL) = (next_relation_id IS NULL))')
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${voteOwners} (`)
      expect(sql).toContain('user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE')
      expect(sql).toContain(`ON ${voteOwners} (user_id);`)
      expect(sql).toContain(
        `FOREIGN KEY (operation_id, priority) REFERENCES ${mappings} (operation_id, priority) ON DELETE CASCADE`,
      )
    }

    expect(sql).not.toContain('topic_merge_user_follow_topic_parent_mappings')
  })
})
