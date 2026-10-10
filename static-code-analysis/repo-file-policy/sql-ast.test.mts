import { describe, expect, it } from 'vitest'

import { extractPolymorphicTargetTables } from './sql-constraint-ast.mts'
import { stripSqlComments } from './sql-scanner.mts'

describe('sql AST facts consumers', () => {
  it('rejects stored entity pairs but permits generated compatibility columns', async () => {
    expect(
      await extractPolymorphicTargetTables(`
        CREATE TABLE unsafe_targets (entity_type text, entity_id uuid);
        CREATE TABLE compatible_targets (
          topic_id uuid REFERENCES topics ON DELETE CASCADE,
          entity_type text GENERATED ALWAYS AS ('topic') STORED,
          entity_id uuid GENERATED ALWAYS AS (topic_id) STORED
        );
      `),
    ).toEqual([{ location: expect.any(Number), tableName: 'unsafe_targets' }])
  })

  it('keeps the parser byte offset for a quoted table after a multibyte comment', async () => {
    const content = stripSqlComments(
      '-- é\nCREATE TABLE public."MixedCase" (entity_type text, entity_id uuid);',
    )
    expect(await extractPolymorphicTargetTables(content)).toEqual([
      {
        location: Buffer.byteLength(content.slice(0, content.indexOf('CREATE TABLE'))),
        tableName: 'MixedCase',
      },
    ])
  })

  it('rejects malformed SQL even after a valid CREATE TABLE', async () => {
    await expect(
      extractPolymorphicTargetTables(
        'CREATE TABLE targets (entity_type text, entity_id uuid); CREATE TABLE (',
      ),
    ).rejects.toThrow(/sql parser error/)
  })
})
