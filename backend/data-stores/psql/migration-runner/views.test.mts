import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type pg from 'pg'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { QueryExecutor, QueryInput } from '../types.mts'
import { loadSqlParserModule } from './sql-statements.mts'
import { buildDropViewsStatement, extractViewNames, runViews } from './views.mts'

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
      extractViewNames(`
        -- CREATE OR REPLACE VIEW ignored_line AS SELECT 1;
        SELECT 'CREATE OR REPLACE VIEW ignored_string AS SELECT 1';
        SELECT 'don''t CREATE OR REPLACE VIEW ignored_escaped_string AS SELECT 1';
        /* CREATE OR REPLACE VIEW ignored_block AS SELECT 1; */
        CREATE OR REPLACE VIEW public.visible_view AS SELECT 1;
        CREATE OR REPLACE TEMP VIEW "quoted schema"."quoted.view" AS SELECT 2;
        CREATE OR REPLACE VIEW "quoted "" identifier" AS SELECT 3;
        CREATE OR REPLACE RECURSIVE VIEW recursive_view(x) AS SELECT 3 AS x;
      `),
    ).toEqual([
      'public.visible_view',
      '"quoted schema"."quoted.view"',
      '"quoted "" identifier"',
      'recursive_view',
    ])
  })

  it('returns empty array for SQL that cannot be parsed', () => {
    // Exercises the try-catch around parseSync in extractViewNames
    expect(extractViewNames('CREATE TABLE (')).toEqual([])
  })

  it('builds stable drop statements for unique view names', () => {
    expect(buildDropViewsStatement([])).toBeNull()
    expect(buildDropViewsStatement(['view_a', 'view_b', 'view_a'])).toBe(
      'DROP VIEW IF EXISTS view_a, view_b;',
    )
  })

  it('drops forced views before recreating SQL files', async () => {
    const viewsDir = await makeViewsDir()
    await writeFile(join(viewsDir, '0010-a.sql'), 'CREATE OR REPLACE VIEW view_a AS SELECT 1;')
    await writeFile(join(viewsDir, '0020-b.sql'), 'CREATE OR REPLACE VIEW view_b AS SELECT 2;')
    const writes: string[] = []

    await runViews('/unused-root', {
      folder: viewsDir,
      forced: true,
      writer: makeWriter(writes),
    })

    expect(writes).toEqual([
      '/* runViews */ DROP VIEW IF EXISTS view_a, view_b;',
      '/* runViews */ CREATE OR REPLACE VIEW view_a AS SELECT 1',
      '/* runViews */ CREATE OR REPLACE VIEW view_b AS SELECT 2',
    ])
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
    const sql = String(input)
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
