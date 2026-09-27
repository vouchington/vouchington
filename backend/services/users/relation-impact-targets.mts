import {
  entityRelationMetadatum,
  getEntityRelationIntegrityTargetColumn,
} from '@services/entity-relations/metadata'
import type { EntityRelationVoteTarget } from './delete-entity-relation-votes.mts'

export const electedRelationMetadata = entityRelationMetadatum.filter(metadata => metadata.election)

export function getElectedRelationMetadata(relationTable: string) {
  const metadata = electedRelationMetadata.find(entry => entry.table_name === relationTable)
  if (!metadata) throw new Error(`Unknown elected relation table: ${relationTable}`)
  return metadata
}

export function getElectedRelationTargetColumn(relationTable: string): string {
  return getEntityRelationIntegrityTargetColumn(getElectedRelationMetadata(relationTable))
}

export function mapRelationImpactRow(row: Record<string, unknown>): EntityRelationVoteTarget {
  const subjectId = row.subject_id
  if (typeof subjectId !== 'string') throw new Error('Relation impact has no subject identity')
  const targets = electedRelationMetadata.flatMap(metadata => {
    const relationId = row[getEntityRelationIntegrityTargetColumn(metadata)]
    return relationId === null || relationId === undefined ? [] : [{ metadata, relationId }]
  })
  if (targets.length !== 1 || typeof targets[0]!.relationId !== 'string') {
    throw new Error('Relation impact must have exactly one concrete relation target')
  }
  const target = targets[0]!
  return {
    relationTable: target.metadata.table_name,
    subjectId,
    entityRelationId: target.relationId as string,
  }
}
