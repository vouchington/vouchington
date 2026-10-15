import type { ElectionLane } from '@queues/background/enqueues/vote-aggregation-jobs'

/** The lane an election recomputes in; its ordering key is `vote-aggregation:<lane>`. */
export type ElectionOrderingKey = ElectionLane

declare const entityRelationElectionTableBrand: unique symbol
export type EntityRelationElectionTable = string & {
  readonly [entityRelationElectionTableBrand]: true
}

export type EntityRelationElectionTarget = {
  entityRelationId: string
  relationTable: EntityRelationElectionTable
}

export type ElectionJobInput =
  | {
      electionId: string
      orderingKey: Exclude<ElectionOrderingKey, 'entity_relation'>
      relationTable?: never
    }
  | {
      electionId: string
      orderingKey: 'entity_relation'
      relationTable: EntityRelationElectionTable
    }
