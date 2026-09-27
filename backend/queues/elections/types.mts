import type { ELECTIONS_ORDERING } from './config.mts'

export type ElectionsJobs = 'processUpdateElectionVoteStats'
export type ElectionOrderingKey = keyof typeof ELECTIONS_ORDERING

declare const entityRelationElectionTableBrand: unique symbol
export type EntityRelationElectionTable = string & {
  readonly [entityRelationElectionTableBrand]: true
}

export type EntityRelationElectionTarget = {
  entityRelationId: string
  relationTable: EntityRelationElectionTable
}

export type ElectionsJobData = {
  name: ElectionsJobs
  data:
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
}
