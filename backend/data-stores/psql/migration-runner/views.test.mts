import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type pg from 'pg'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { QueryExecutor, QueryInput } from '../types.mts'
import { loadSqlParserModule } from './sql-statements.mts'
import { runViews } from './views.mts'
import {
  buildDropViewStatement,
  buildDropViewsStatement,
  extractViewDeclarations,
} from './view-sql.mts'

import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

describe('migration runner views', () => {
  beforeAll(() => loadSqlParserModule())
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeViewsDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-migration-views-'))
    testDirs.push(dir)
    return dir
  }

  it('extracts created view names while ignoring comments and string literals', () => {
    expect(
      extractViewDeclarations(`
        -- CREATE OR REPLACE VIEW ignored_line AS SELECT 1;
        SELECT 'CREATE OR REPLACE VIEW ignored_string AS SELECT 1';
        SELECT 'don''t CREATE OR REPLACE VIEW ignored_escaped_string AS SELECT 1';
        /* CREATE OR REPLACE VIEW ignored_block AS SELECT 1; */
        CREATE OR REPLACE VIEW public.visible_view AS SELECT 1;
        CREATE OR REPLACE TEMP VIEW "quoted schema"."quoted.view" AS SELECT 2;
        CREATE OR REPLACE VIEW "quoted "" identifier" AS SELECT 3;
        CREATE OR REPLACE RECURSIVE VIEW recursive_view(x) AS SELECT 3 AS x;
      `).map(declaration => declaration.name),
    ).toEqual([
      'public.visible_view',
      '"quoted schema"."quoted.view"',
      '"quoted "" identifier"',
      'recursive_view',
    ])
  })

  it('extracts typed materialized view declarations without selecting tables', () => {
    expect(
      extractViewDeclarations(`
        CREATE MATERIALIZED VIEW "quoted schema"."quoted.matview" AS SELECT 1;
        CREATE TABLE ordinary_table AS SELECT 1;
        CREATE VIEW ordinary_view AS SELECT 1;
      `),
    ).toEqual([
      { name: '"quoted schema"."quoted.matview"', type: 'materialized view' },
      { name: 'ordinary_view', type: 'view' },
    ])
  })

  it('returns empty array for SQL that cannot be parsed', () => {
    // Exercises the try-catch around parseSync in extractViewDeclarations.
    expect(extractViewDeclarations('CREATE TABLE (')).toEqual([])
  })

  it('builds restricted typed drop statements', () => {
    expect(buildDropViewStatement({ name: 'view_a', type: 'view' })).toBe(
      'DROP VIEW IF EXISTS view_a;',
    )
    expect(buildDropViewStatement({ name: 'matview_b', type: 'materialized view' })).toBe(
      'DROP MATERIALIZED VIEW IF EXISTS matview_b;',
    )
  })

  it('builds one escaped server-side teardown command', () => {
    const statement = buildDropViewsStatement([
      { name: '"quoted\'\\$tag$"', type: 'view' },
      { name: 'matview', type: 'materialized view' },
    ])

    expect(statement).toContain('DO ')
    expect(statement).toContain('dependent_objects_still_exist')
    expect(statement).toContain('DROP VIEW IF EXISTS "quoted')
    expect(statement).toContain('DROP MATERIALIZED VIEW IF EXISTS matview;')
  })

  it('drops forced views before recreating SQL files', async () => {
    const viewsDir = await makeViewsDir()
    await writeFile(join(viewsDir, '0010-a.sql'), 'CREATE OR REPLACE VIEW view_a AS SELECT 1;')
    await writeFile(join(viewsDir, '0020-b.sql'), 'CREATE MATERIALIZED VIEW view_b AS SELECT 2;')
    const writes: string[] = []

    await runViews('/unused-root', {
      folder: viewsDir,
      forced: true,
      writer: makeWriter(writes),
    })

    expect(writes[0]).toContain('DROP VIEW IF EXISTS view_a;')
    expect(writes[0]).toContain('DROP MATERIALIZED VIEW IF EXISTS view_b;')
    expect(writes.slice(1)).toEqual([
      '/* runViews */ CREATE OR REPLACE VIEW view_a AS SELECT 1',
      '/* runViews */ CREATE MATERIALIZED VIEW view_b AS SELECT 2',
    ])
  })

  it('drops a repeated managed declaration once before recreating each statement', async () => {
    const viewsDir = await makeViewsDir()
    await writeFile(
      join(viewsDir, '0010-a.sql'),
      'CREATE VIEW view_a AS SELECT 1; CREATE OR REPLACE VIEW view_a AS SELECT 2;',
    )
    const writes: string[] = []

    await runViews('/unused-root', { folder: viewsDir, forced: true, writer: makeWriter(writes) })

    expect(writes.filter(sql => sql.includes('DROP VIEW IF EXISTS view_a;'))).toHaveLength(1)
    expect(writes.slice(1)).toEqual([
      '/* runViews */ CREATE VIEW view_a AS SELECT 1',
      '/* runViews */ CREATE OR REPLACE VIEW view_a AS SELECT 2',
    ])
  })

  it('propagates non-dependency drop errors immediately', async () => {
    const viewsDir = await makeViewsDir()
    await writeFile(join(viewsDir, '0010-a.sql'), 'CREATE VIEW view_a AS SELECT 1;')

    await expect(
      runViews('/unused-root', {
        folder: viewsDir,
        forced: true,
        writer: makeWriter([], () => {
          throw new Error('permission denied')
        }),
      }),
    ).rejects.toThrow('permission denied')
  })

  it('executes each statement in a multi-view file separately', async () => {
    const viewsDir = await makeViewsDir()
    await writeFile(
      join(viewsDir, '0010-views.sql'),
      'CREATE OR REPLACE VIEW view_a AS SELECT 1; CREATE OR REPLACE VIEW view_b AS SELECT 2;',
    )
    const writes: string[] = []

    await runViews('/unused-root', { folder: viewsDir, writer: makeWriter(writes) })

    expect(writes).toEqual([
      '/* runViews */ CREATE OR REPLACE VIEW view_a AS SELECT 1',
      '/* runViews */ CREATE OR REPLACE VIEW view_b AS SELECT 2',
    ])
  })

  it('retries blocked views after later views make progress', async () => {
    const viewsDir = await makeViewsDir()
    await writeFile(
      join(viewsDir, '0010-dependent.sql'),
      'CREATE OR REPLACE VIEW dependent AS SELECT * FROM base;',
    )
    await writeFile(join(viewsDir, '0020-base.sql'), 'CREATE OR REPLACE VIEW base AS SELECT 1;')
    const writes: string[] = []
    let baseCreated = false

    await runViews('/unused-root', {
      folder: viewsDir,
      writer: makeWriter(writes, sql => {
        if (sql.includes('CREATE OR REPLACE VIEW base')) {
          baseCreated = true
        }
        if (sql.includes('CREATE OR REPLACE VIEW dependent') && !baseCreated) {
          throw new Error('relation "base" does not exist')
        }
      }),
    })

    expect(writes).toEqual([
      '/* runViews */ CREATE OR REPLACE VIEW dependent AS SELECT * FROM base',
      '/* runViews */ CREATE OR REPLACE VIEW base AS SELECT 1',
      '/* runViews */ CREATE OR REPLACE VIEW dependent AS SELECT * FROM base',
    ])
  })

  it('throws when no pending view can be recreated', async () => {
    const viewsDir = await makeViewsDir()
    await writeFile(join(viewsDir, '0010-a.sql'), 'CREATE OR REPLACE VIEW view_a AS SELECT 1;')
    await writeFile(join(viewsDir, '0020-b.sql'), 'CREATE OR REPLACE VIEW view_b AS SELECT 2;')
    const errors: unknown[] = []

    await expect(
      runViews('/unused-root', {
        folder: viewsDir,
        logger: {
          error: (...args: unknown[]) => {
            errors.push(args)
          },
          log: () => {},
        },
        writer: makeWriter([], () => {
          throw new Error('blocked')
        }),
      }),
    ).rejects.toThrow('blocked')
    expect(errors[0]).toEqual([
      'ERROR: view recreation made no progress; blocked views: %s',
      '0010-a.sql, 0020-b.sql',
    ])
  })
})

function makeWriter(writes: string[], onWrite: (sql: string) => void = () => {}): QueryExecutor {
  return (input: QueryInput): Promise<pg.QueryResult> => {
    const sql = stringFromUnknown(input)
    writes.push(sql)
    onWrite(sql)
    return Promise.resolve({
      command: '',
      fields: [],
      oid: 0,
      rowCount: null,
      rows: [],
    })
  }
}
