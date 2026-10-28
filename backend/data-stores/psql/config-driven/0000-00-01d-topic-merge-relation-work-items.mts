import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { topicMergeRelationScratchNames } from '@voucha/types/entities/topic-merge-relation-scratch'

// Index names preserve every table word in order while fitting PostgreSQL's 63-byte limit.
const abbreviatedWords = (name: string) =>
  name
    .split('_')
    .map(word => word.slice(0, 4))
    .join('_')

/** loaded after concrete and retained elected parents by the config-driven runner */
export default function generateTopicMergeRelationWorkItemsSql(): string {
  return entityRelationMetadatum
    .flatMap(metadata => {
      if (
        !metadata.election ||
        (metadata.subject_type !== 'topic' && metadata.object_type !== 'topic')
      )
        return []
      const { suffix, mappings: table, owners: users } = topicMergeRelationScratchNames(metadata)
      const mappingIndex = `idx_${abbreviatedWords(table)}__`
      const ownerIndex = `idx_${abbreviatedWords(users)}__`
      const flagIndex = `idx_vote_integrity_flags__${abbreviatedWords(suffix)}_page`
      const relation = metadata.table_name
      return [
        `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS ${table} (
  operation_id UUID NOT NULL REFERENCES topic_merge_operations (id) ON DELETE CASCADE,
  priority SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 4),
  old_subject_id UUID NOT NULL,
  old_relation_id UUID NOT NULL,
  next_subject_id UUID,
  next_relation_id UUID,
  PRIMARY KEY (operation_id, priority),
  FOREIGN KEY (old_subject_id, old_relation_id)
    REFERENCES retained_${relation} (subject_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (next_subject_id, next_relation_id)
    REFERENCES ${relation} (subject_id, id) ON DELETE RESTRICT,
  CHECK ((next_subject_id IS NULL) = (next_relation_id IS NULL))
);
CREATE INDEX IF NOT EXISTS ${mappingIndex}old_parent
  ON ${table} (old_subject_id, old_relation_id);
CREATE INDEX IF NOT EXISTS ${mappingIndex}next_parent
  ON ${table} (next_subject_id, next_relation_id);
CREATE INDEX IF NOT EXISTS ${flagIndex}
  ON vote_integrity_flags (${relation}_id, id)
  WHERE ${relation}_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ${users} (
  operation_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  priority SMALLINT NOT NULL,
  cursor_vote_id UUID NOT NULL,
  score SMALLINT,
  PRIMARY KEY (operation_id, user_id),
  FOREIGN KEY (operation_id, priority) REFERENCES ${table} (operation_id, priority) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ${ownerIndex}priority ON ${users} (operation_id, priority);
CREATE INDEX IF NOT EXISTS ${ownerIndex}user_id ON ${users} (user_id);
COMMENT ON TABLE ${table} IS 'At most four original concrete parents for the active normalized relation pair; the next parent is a live temporary anchor or final destination.';
COMMENT ON COLUMN ${table}.operation_id IS 'Owning topic merge operation.';
COMMENT ON COLUMN ${table}.priority IS 'Original collision rank: live first, fewer source endpoints, then relation id descending.';
COMMENT ON COLUMN ${table}.old_subject_id IS 'Subject paired with the retained original relation identity.';
COMMENT ON COLUMN ${table}.old_relation_id IS 'Retained original parent; remains valid after the emptied live parent is deleted.';
COMMENT ON COLUMN ${table}.next_subject_id IS 'Subject paired with the live child destination, null for self-relation deletion.';
COMMENT ON COLUMN ${table}.next_relation_id IS 'Live child destination, null for self-relation deletion.';
COMMENT ON TABLE ${users} IS 'Original winning parent and latest event per user, captured completely before any ballot history is moved.';
COMMENT ON COLUMN ${users}.operation_id IS 'Owning active relation group.';
COMMENT ON COLUMN ${users}.user_id IS 'Ballot author.';
COMMENT ON COLUMN ${users}.priority IS 'Original parent that wins all ballot events for this author.';
COMMENT ON COLUMN ${users}.cursor_vote_id IS 'Latest original ballot-event position for the winning parent, not a joined live relationship.';
COMMENT ON COLUMN ${users}.score IS 'Latest original ballot value, including a null clear event.';`,
      ]
    })
    .join('\n\n')
}
