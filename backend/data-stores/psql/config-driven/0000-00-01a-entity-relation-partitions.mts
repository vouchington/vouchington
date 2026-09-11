import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { generateDefaultPartitions } from './utils/partition-utils.mts'

export default () => {
  return createPostRelationPartitions()
}

function createPostRelationPartitions(): string {
  // Get all table names where post is the subject.
  // User-subject tables are not partitioned (see 0000-00-01-entity-relations.mts).
  const postSubjectTables = entityRelationMetadatum.flatMap(m =>
    m.subject_type === 'post' ? [m.table_name] : [],
  )

  if (postSubjectTables.length === 0) {
    return ''
  }

  return generateDefaultPartitions(postSubjectTables)
}
