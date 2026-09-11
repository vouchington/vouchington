import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  describe('config-driven SQL after no-mistakes consume', () => {
    it(
      'allows INSERT ... ON CONFLICT in a config-driven SQL file',
      { timeout: 10_000 },
      async () => {
        const dir = await makeRepo()
        await track(
          dir,
          'backend/data-stores/psql/config-driven/0999-seed.sql',
          "INSERT INTO foo (id) VALUES ('bar') ON CONFLICT DO NOTHING;\n",
        )

        await expect(run(dir)).resolves.toMatchObject({
          stdout: expect.stringContaining('pass'),
        })
      },
    )

    it(
      'allows INSERT ... WHERE NOT EXISTS in a config-driven SQL file',
      { timeout: 10_000 },
      async () => {
        const dir = await makeRepo()
        await track(
          dir,
          'backend/data-stores/psql/config-driven/0999-seed.sql',
          "INSERT INTO foo (id) SELECT 'bar' WHERE NOT EXISTS (SELECT 1 FROM foo WHERE id = 'bar');\n",
        )

        await expect(run(dir)).resolves.toMatchObject({
          stdout: expect.stringContaining('pass'),
        })
      },
    )

    it(
      'allows CREATE OR REPLACE FUNCTION in a config-driven SQL file',
      { timeout: 10_000 },
      async () => {
        const dir = await makeRepo()
        await track(
          dir,
          'backend/data-stores/psql/config-driven/0999-fn.sql',
          'CREATE OR REPLACE FUNCTION fn_foo() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;\n',
        )

        await expect(run(dir)).resolves.toMatchObject({
          stdout: expect.stringContaining('pass'),
        })
      },
    )

    it('ignores commented-out DDL in a config-driven SQL file', { timeout: 10_000 }, async () => {
      const dir = await makeRepo()
      await track(
        dir,
        'backend/data-stores/psql/config-driven/0999-commented.sql',
        '-- CREATE TABLE foo (id UUID PRIMARY KEY);\n-- ALTER TABLE foo ADD COLUMN bar TEXT;\n',
      )

      await expect(run(dir)).resolves.toMatchObject({
        stdout: expect.stringContaining('pass'),
      })
    })

    it(
      'ignores block-comment DDL and does not split INSERT on semicolon in string',
      { timeout: 10_000 },
      async () => {
        const dir = await makeRepo()
        await track(
          dir,
          'backend/data-stores/psql/config-driven/0999-edge-cases.sql',
          '/* CREATE TABLE foo (id UUID PRIMARY KEY); */\n' +
            "INSERT INTO foo (slug) SELECT 'bar;baz' WHERE NOT EXISTS (SELECT 1 FROM foo WHERE slug = 'bar;baz');\n",
        )
        await expect(run(dir)).resolves.toMatchObject({ stdout: expect.stringContaining('pass') })
      },
    )

    it(
      'does not apply config-driven guard to files outside config-driven/',
      { timeout: 10_000 },
      async () => {
        const dir = await makeRepo()
        await track(
          dir,
          'backend/data-stores/psql/migrations/0999-ddl.sql',
          'CREATE TABLE IF NOT EXISTS foo (id UUID PRIMARY KEY);\n',
        )

        // migration-sql-guard allows CREATE TABLE; postgres-sql-statement-policy only
        // scans config-driven SQL, so a migrations/ CREATE TABLE must not fail this runner.
        await expect(run(dir)).resolves.toMatchObject({
          stdout: expect.stringContaining('pass'),
        })
      },
    )
  })
})
