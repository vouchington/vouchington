'use strict'

/** @type {import('dependency-cruiser').IForbiddenRuleType} */
const noBuildInsertQueryOutsideEntityRelations = {
  name: 'no-build-insert-query-outside-entity-relations',
  comment:
    'build-insert-query.mts is the raw relation-insert primitive. Only entity-relations writers may import it. Use upsertEntityRelation() or writeEntityRelations() instead.',
  severity: 'error',
  from: {
    pathNot: '^backend/services/entity-relations/',
  },
  to: {
    path: '^backend/services/entity-relations/build-insert-query',
  },
}

module.exports = { noBuildInsertQueryOutsideEntityRelations }
