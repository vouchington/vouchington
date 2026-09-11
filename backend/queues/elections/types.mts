export type ElectionsJobs = 'processUpdateElectionVoteStats'

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
  data: {
    electionId: string
    relationTable?: string
  }
}
