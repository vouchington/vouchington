import { beforeAll, describe, expect, it } from 'vitest'

import { extractCreateTableMetadata, initSqlAst } from './sql-ast.mts'
import { extractPolymorphicTargetTables } from './sql-constraint-ast.mts'

describe('sql-ast local consume wrappers', () => {
  beforeAll(() => initSqlAst())

  it('parses CREATE TABLE metadata', () => {
    const content = [
      'CREATE TABLE public."MixedCase" (',
      '  id uuid PRIMARY KEY DEFAULT uuidv7(),',
      '  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,',
      '  note text -- comment with arrow →',
      ');',
    ].join('\n')

    const [table] = extractCreateTableMetadata(content)
    expect(table).toBeDefined()
    if (!table) throw new Error('expected CREATE TABLE metadata')
    expect(table.tableName).toBe('MixedCase')
  })

  it('rejects stored entity pairs but permits generated compatibility columns', () => {
    expect(
      extractPolymorphicTargetTables(`
        CREATE TABLE unsafe_targets (entity_type text, entity_id uuid);
        CREATE TABLE compatible_targets (
          topic_id uuid REFERENCES topics ON DELETE CASCADE,
          entity_type text GENERATED ALWAYS AS ('topic') STORED,
          entity_id uuid GENERATED ALWAYS AS (topic_id) STORED
        );
      `),
    ).toEqual([{ location: expect.any(Number), tableName: 'unsafe_targets' }])
  })
})
