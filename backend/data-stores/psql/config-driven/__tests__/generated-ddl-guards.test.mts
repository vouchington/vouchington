import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'
import { initSqlAst } from 'vouchington-tooling/sql-ast'

import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import {
  findFirstGeneratedDdlViolation,
  loadGeneratedConfigDrivenSql,
} from '../../test-helpers/config-driven/generated-ddl-guard-helpers.mts'
import { findFirstUnguardedInsertViolation } from '../../test-helpers/config-driven/generated-ddl-insert-invariants.mts'
import { findFirstUuidv7CreatedAtViolation } from '../../test-helpers/config-driven/generated-ddl-schema-invariants.mts'
import {
  readDollarQuoteDelimiter,
  readSqlLiteralAt,
} from '../../test-helpers/config-driven/sql-literal-readers.mts'
import {
  maskSqlLiterals,
  stripSqlComments,
} from '../../test-helpers/config-driven/sql-text-scanner-helpers.mts'

const configDrivenDir = fileURLToPath(new URL('..', import.meta.url))

describe('config-driven generated DDL guards', () => {
  beforeAll(() => Promise.all([loadSqlParserModule(), initSqlAst()]))
  it('requires generated structural DDL to carry its own guard', async () => {
    const generatedSql = await loadGeneratedConfigDrivenSql(configDrivenDir)

    for (const { file, sql } of generatedSql) {
      expect({ file, violation: findFirstGeneratedDdlViolation(sql) }).toEqual({
        file,
        violation: null,
      })
    }
  })

  it('requires UUIDv7-keyed tables to derive created_at from id', async () => {
    const generatedSql = await loadGeneratedConfigDrivenSql(configDrivenDir)

    for (const { file, sql } of generatedSql) {
      expect({ file, violation: findFirstUuidv7CreatedAtViolation(sql) }).toEqual({
        file,
        violation: null,
      })
    }
  })

  it('requires generated INSERT statements to be re-runnable', async () => {
    const generatedSql = await loadGeneratedConfigDrivenSql(configDrivenDir)

    for (const { file, sql } of generatedSql) {
      expect({ file, violation: findFirstUnguardedInsertViolation(sql) }).toEqual({
        file,
        violation: null,
      })
    }
  })

  it('fails when config-driven generator modules do not export SQL generators', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'config-driven-ddl-guards-'))
    await writeFile(join(directory, '0000-not-a-generator.mts'), 'export default 1\n')

    await expect(loadGeneratedConfigDrivenSql(directory)).rejects.toThrow(
      '0000-not-a-generator.mts must export a default SQL generator',
    )

    const secondDirectory = await mkdtemp(join(tmpdir(), 'config-driven-ddl-guards-'))
    await writeFile(
      join(secondDirectory, '0000-not-sql.mts'),
      'export default function generateSql() { return 1 }\n',
    )

    await expect(loadGeneratedConfigDrivenSql(secondDirectory)).rejects.toThrow(
      '0000-not-sql.mts must generate SQL text',
    )
  })

  it('keeps SQL literal scanners quote-aware while removing executable comments', () => {
    expect(
      stripSqlComments(
        "SELECT 'it''s /* still text */'; /* outer /* nested */ done */ CREATE TABLE hidden (id uuid);",
      ),
    ).toContain("SELECT 'it''s /* still text */';")
    expect(stripSqlComments('-- comment\nCREATE TABLE hidden (id uuid);')).toBe(
      '          \nCREATE TABLE hidden (id uuid);',
    )

    const masked = maskSqlLiterals(
      "SELECT 'it''s text'; DO $body$ BEGIN\nRAISE NOTICE 'x';\nEND $body$;",
    )
    expect(masked).toContain('$body$')
    expect(masked).toContain('\n')
    expect(masked).not.toContain('RAISE NOTICE')
    expect(readDollarQuoteDelimiter('$body$ SELECT 1', 0)).toBe('$body$')
    expect(readDollarQuoteDelimiter('SELECT $body$', 0)).toBeNull()
    expect(readDollarQuoteDelimiter('x$body$', 1)).toBeNull()
    expect(readSqlLiteralAt("'unterminated", 0)).toBeNull()
    expect(readSqlLiteralAt(String.raw`E'can\'t /* still text */'`, 0)).toEqual({
      end: 26,
      text: "can't /* still text */",
    })
    expect(
      findFirstGeneratedDdlViolation(
        String.raw`INSERT INTO prompts (body) VALUES (E'can\'t /* IF NOT EXISTS */ ALTER TABLE hidden');`,
      ),
    ).toBeNull()
  })
})
