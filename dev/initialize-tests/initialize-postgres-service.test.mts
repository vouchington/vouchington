import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupWorktreeDirs,
  makeWorktreeDir,
  runInitializeHelper,
} from '../test-helpers/initialize.mts'

describe('initialize local PostgreSQL service', () => {
  afterEach(cleanupWorktreeDirs)

  it('reuses the authoritative DATABASE_URL for connection recovery', async () => {
    const cwd = await makeWorktreeDir('feature-db-connection-recovery')
    const output = await runInitializeHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-connection-recovery
    print_database_connection_error
    `,
    })

    expect(output).toContain('Inspect DATABASE_URL in .env')
    expect(output).toContain('source .env && ./dev/initialize web')
    expect(output).not.toContain('PGHOST=localhost')
    expect(output).not.toContain('DATABASE_URL=postgres://localhost')
  })

  it('starts Homebrew PostgreSQL for the default local database on macOS', async () => {
    const cwd = await makeWorktreeDir('feature-db-start-default-postgres')
    const output = await runInitializeHelper({
      cwd,
      script: `
    unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
    uname() { printf 'Darwin\\n'; }
    brew() { printf 'brew:%s\\n' "$*"; }
    prepare_worktree_database_host
    `,
    })

    expect(output).toContain('brew:services start postgresql@18')
  })

  it('starts Homebrew PostgreSQL when a disposable clone inherits a foreign DATABASE_URL', async () => {
    const cwd = await makeWorktreeDir('feature-db-replace-inherited-voucha')
    const output = await runInitializeHelper({
      cwd,
      script: `
    DB_NAME=voucha-clone
    DATABASE_URL=postgres://localhost/voucha
    unset PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
    uname() { printf 'Darwin\\n'; }
    brew() { printf 'brew:%s\\n' "$*"; }
    prepare_worktree_database_host
    `,
    })

    expect(output).toContain('brew:services start postgresql@18')
  })

  it('does not start Homebrew PostgreSQL for an explicit database URL', async () => {
    const cwd = await makeWorktreeDir('feature-db-skip-custom-postgres')
    const output = await runInitializeHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://localhost:15432/voucha-custom
    uname() { printf 'Darwin\\n'; }
    brew() { printf 'brew:%s\\n' "$*"; }
    prepare_worktree_database_host
    `,
    })

    expect(output).toBe('')
  })

  it.each([
    { databaseUrl: '', variable: 'PGHOST' },
    { databaseUrl: '', variable: 'PGHOSTADDR' },
    { databaseUrl: '', variable: 'PGPORT' },
    { databaseUrl: '', variable: 'PGSERVICE' },
    { databaseUrl: '', variable: 'PGSERVICEFILE' },
    { databaseUrl: 'postgresql:///voucha-custom', variable: 'PGPORT' },
  ])(
    'rejects $variable when DATABASE_URL is not self-contained',
    async ({ databaseUrl, variable }) => {
      const cwd = await makeWorktreeDir(`feature-db-reject-${variable.toLowerCase()}`)

      await expect(
        runInitializeHelper({
          cwd,
          script: `
      unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
      ${databaseUrl ? `export DATABASE_URL=${databaseUrl}` : ''}
      export ${variable}=custom-target
      uname() { printf 'Linux\\n'; }
      brew() { printf 'brew:%s\\n' "$*"; }
      prepare_worktree_database_host
      `,
        }),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringMatching(/Set DATABASE_URL explicitly/),
        stdout: '',
      })
    },
  )

  it('rejects a PostgreSQL service target loaded from shared host config', async () => {
    const cwd = await makeWorktreeDir('feature-db-reject-shared-pgservice')
    const home = await makeWorktreeDir('shared-pgservice-home')
    await writeFile(join(home, 'voucha.env'), 'export PGSERVICE=voucha-custom\n')

    await expect(
      runInitializeHelper({
        cwd,
        home,
        script: `
      unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
      source "$HOME/voucha.env"
      uname() { printf 'Darwin\\n'; }
      brew() { printf 'brew:%s\\n' "$*"; }
      prepare_worktree_database_host
      `,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/PGSERVICE[\s\S]*Set DATABASE_URL explicitly/),
      stdout: '',
    })
  })

  it('does not start Homebrew PostgreSQL for a database URL loaded from shared host config', async () => {
    const cwd = await makeWorktreeDir('feature-db-skip-shared-env-postgres')
    const home = await makeWorktreeDir('shared-host-config-home')
    await writeFile(
      join(home, 'voucha.env'),
      'export DATABASE_URL=postgres://dbhost:15432/voucha-custom\n',
    )
    const output = await runInitializeHelper({
      cwd,
      home,
      script: `
    unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
    source "$HOME/voucha.env"
    uname() { printf 'Darwin\\n'; }
    brew() { printf 'brew:%s\\n' "$*"; }
    prepare_worktree_database_host
    `,
    })

    expect(output).toBe('')
  })

  it('does not start Homebrew PostgreSQL for a retained custom worktree database URL', async () => {
    const cwd = await makeWorktreeDir('feature-db-skip-retained-custom-postgres')
    const output = await runInitializeHelper({
      cwd,
      script: `
    cat > .env <<'ENV'
export WORKTREE_DIR=feature-db-skip-retained-custom-postgres
export DATABASE_URL=postgres://dbhost:15432/voucha-custom
ENV
    unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
    WORKTREE_DIR=feature-db-skip-retained-custom-postgres
    DB_NAME=voucha-feature-db-skip-retained-custom-postgres
    VALKEY_PORT=6379
    BACKEND_PORT=3001
    VALKEY_CONTAINER=voucha-valkey-test
    WORKER_PORT=8788
    IMAGE_LAMBDA_PORT=4001
    NEXT_PORT=3002
    STORYBOOK_PORT=6006
    INSPECTOR_PORT=9229
    CF_WORKER_SECRET=secret
    API_KEY_CHECKSUM_SECRET=checksum
    VOUCHA_OTP_TOKEN_HASH_SECRET=otp
    VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
    FINAL_WEB_PUSH_PUBLIC_KEY=public
    FINAL_WEB_PUSH_PRIVATE_KEY=private
    FINAL_WEB_PUSH_SUBJECT=mailto:tests+retained-db-url@voucha.ai
    uname() { printf 'Darwin\\n'; }
    brew() { printf 'brew:%s\\n' "$*"; }
    prepare_worktree_database_host
    write_worktree_env >/dev/null
    set -a
    source .env
    set +a
    printf '%s' "$DATABASE_URL"
    `,
    })

    expect(output).toBe('postgres://dbhost:15432/voucha-custom')
  })

  it.each([
    { databaseUrl: '', variable: 'PGHOST' },
    { databaseUrl: '', variable: 'PGSERVICE' },
    { databaseUrl: 'postgres://dbhost:15432/voucha-custom', variable: 'PGHOST' },
  ])(
    'rejects retained $variable from a matching worktree environment',
    async ({ databaseUrl, variable }) => {
      const worktreeDir = `feature-db-reject-retained-${variable.toLowerCase()}`
      const cwd = await makeWorktreeDir(worktreeDir)

      await expect(
        runInitializeHelper({
          cwd,
          script: `
      cat > .env <<'ENV'
export WORKTREE_DIR=${worktreeDir}
${databaseUrl ? `export DATABASE_URL=${databaseUrl}` : ''}
export ${variable}=custom-target
ENV
      unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
      WORKTREE_DIR=${worktreeDir}
      DB_NAME=voucha-${worktreeDir}
      uname() { printf 'Linux\\n'; }
      brew() { printf 'brew:%s\\n' "$*"; }
      prepare_worktree_database_host
      `,
        }),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringMatching(new RegExp(`${variable}.*Set DATABASE_URL explicitly`, 's')),
        stdout: '',
      })
    },
  )

  it('does not start Homebrew PostgreSQL on Linux', async () => {
    const cwd = await makeWorktreeDir('feature-db-skip-linux-postgres')
    const output = await runInitializeHelper({
      cwd,
      script: `
    unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
    uname() { printf 'Linux\\n'; }
    brew() { printf 'brew:%s\\n' "$*"; }
    prepare_worktree_database_host
    `,
    })

    expect(output).toBe('')
  })

  it('fails with an actionable error when Homebrew cannot start PostgreSQL', async () => {
    const cwd = await makeWorktreeDir('feature-db-failed-postgres-start')

    await expect(
      runInitializeHelper({
        cwd,
        script: `
      unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
      uname() { printf 'Darwin\\n'; }
      brew() { return 1; }
      prepare_worktree_database_host
      `,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(
        /Failed to start Homebrew PostgreSQL 18[\s\S]*brew services info postgresql@18/,
      ),
    })
  })

  it('fails with the host provisioning route when Homebrew is missing for the default target', async () => {
    const cwd = await makeWorktreeDir('feature-db-missing-homebrew')

    await expect(
      runInitializeHelper({
        cwd,
        script: `
      unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
      uname() { printf 'Darwin\\n'; }
      command() {
        if [ "$1" = -v ] && [ "$2" = brew ]; then return 1; fi
        builtin command "$@"
      }
      prepare_worktree_database_host
      `,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(
        /Homebrew is required to start the default local PostgreSQL service[\s\S]*vouchington-machines/,
      ),
    })
  })
})
