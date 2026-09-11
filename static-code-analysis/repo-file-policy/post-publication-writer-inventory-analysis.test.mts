import { describe, expect, it } from 'vitest'
import { analyzePostPublicationWriterSource } from './post-publication-writer-inventory-analysis.mts'

const path = 'backend/services/posts/writer.mts'

function analyze(source: string) {
  return analyzePostPublicationWriterSource(source, path)
}

describe('post-publication writer inventory source analysis', () => {
  it('collects every positive source fact', () => {
    expect(
      analyze(`
        import { recordPostPublicationChange as capture } from '@services/post-publication'
        capture(query, change)
        run({ capturePublication: false })
        const table = assertWhitelistedSqlIdentifier(config.entityTable, entityTables, 'entityTable')
        query.append(sql\`UPDATE \`)
        query.append(relation.table_name)
        const electionTable = assertWhitelistedSqlIdentifier(
          target.relationTable, entityRelationElectionTables, 'entityRelationTable',
        )
        query.append(electionTable)
        const update = \`UPDATE \${'posts'} SET title = $1\`
      `),
    ).toEqual({
      callsApprovedCaptureHelper: true,
      optsOutOfPublicationCapture: true,
      writesConfigEntityTable: true,
      writesGeneratedRelationTable: true,
      writesEligibilityTable: true,
    })
  })

  it('does not conflate near-miss source shapes', () => {
    expect(
      analyze(`
        import { recordPostPublicationChange } from '@services/post-publication'
        const note = 'recordPostPublicationChange(query, change)'
        run({ capturePublication: true })
        const table = assertWhitelistedSqlIdentifier(other.entityTable, entityTables, 'entityTable')
        query.append(sql\`SELECT \`)
        query.append(relation.other_table)
        const query = \`SELECT \${'posts'} FROM posts\`
      `),
    ).toEqual({
      callsApprovedCaptureHelper: false,
      optsOutOfPublicationCapture: false,
      writesConfigEntityTable: false,
      writesGeneratedRelationTable: false,
      writesEligibilityTable: false,
    })
  })

  it('recognizes static and dynamic eligibility SQL', () => {
    expect(
      analyze('const query = \'UPDATE ONLY public."posts" SET title = $1\'').writesEligibilityTable,
    ).toBe(true)
    expect(analyze("const query = `DELETE FROM ${'stories'}`").writesEligibilityTable).toBe(true)
  })

  it('resolves approved capture aliases independently of source order', () => {
    expect(
      analyze(`
        capture(query, change)
        import { recordPostPublicationChange as capture } from '@services/post-publication'
      `).callsApprovedCaptureHelper,
    ).toBe(true)
  })

  it('recognizes deletion-lifecycle capture owners at their local module boundaries', () => {
    expect(
      analyze(`
        import { recordPostPublicationChange } from './capture.mts'
        recordPostPublicationChange(query, change)
      `).callsApprovedCaptureHelper,
    ).toBe(true)
    expect(
      analyze(`
        import { recordUserDeletionRelationPublicationChanges } from './delete-entity-relation-votes.mts'
        recordUserDeletionRelationPublicationChanges(changes, query)
      `).callsApprovedCaptureHelper,
    ).toBe(true)
    expect(
      analyze(`
        import { recordUserDeletionRelationPublicationChanges } from './unrelated.mts'
        recordUserDeletionRelationPublicationChanges(changes, query)
      `).callsApprovedCaptureHelper,
    ).toBe(false)
  })

  it('recognizes both generated-relation writer forms', () => {
    expect(
      analyze('const query = buildInsertQuery(relation, creator, pairs)')
        .writesGeneratedRelationTable,
    ).toBe(true)
    expect(
      analyze(`
        const table = assertWhitelistedSqlIdentifier(target.relationTable, entityRelationElectionTables)
        query.append(sql\`UPDATE \`)
        query.append(table)
      `).writesGeneratedRelationTable,
    ).toBe(true)
    expect(
      analyze(`
        query.append(sql\`UPDATE \`)
        query.append(table)
        const table = assertWhitelistedSqlIdentifier(target.relationTable, entityRelationElectionTables)
      `).writesGeneratedRelationTable,
    ).toBe(false)
  })

  it('returns safe empty facts for empty and malformed source', () => {
    expect(analyze('')).toEqual({
      callsApprovedCaptureHelper: false,
      optsOutOfPublicationCapture: false,
      writesConfigEntityTable: false,
      writesGeneratedRelationTable: false,
      writesEligibilityTable: false,
    })
    expect(analyze('const =')).toEqual({
      callsApprovedCaptureHelper: false,
      optsOutOfPublicationCapture: false,
      writesConfigEntityTable: false,
      writesGeneratedRelationTable: false,
      writesEligibilityTable: false,
    })
  })
})
