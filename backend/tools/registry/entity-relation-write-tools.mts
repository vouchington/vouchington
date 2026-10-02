import addEntityRelationTool from '../add-entity-relation.mts'
import removeEntityRelationTool from '../remove-entity-relation.mts'
import withdrawEntityRelationVoteTool from '../withdraw-entity-relation-vote.mts'

/** The write tools for entity relations: adding a tag, removing one and withdrawing a vote. */
export const entityRelationWriteTools = [
  addEntityRelationTool,
  removeEntityRelationTool,
  withdrawEntityRelationVoteTool,
]
