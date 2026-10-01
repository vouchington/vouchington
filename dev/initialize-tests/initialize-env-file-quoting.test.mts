import { dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupWorktreeDirs,
  initializeBashArgs,
  makeWorktreeDir,
  runSourcedBash,
} from '../test-helpers/initialize.mts'
import { runProcess } from '../test-helpers/run-process.mts'

// The worktree .env is read two ways: `source .env` (bash/zsh) and `node --env-file=.env`
// (dotenv). Every value ./dev/initialize writes must come back identical from both. These
// values are synthetic and chosen to break the old `printf %q` output, which backslash-escaped
// spaces and metacharacters that dotenv then kept literally.
const WITH_METACHARACTERS = (key: string) => `fake-${key} spaced $HOME \\n back\\slash=eq # hash`
const WITH_APOSTROPHE = (key: string) => `fake-${key} it's spaced=eq # hash`

// Shell variable names write_worktree_env reads, mapped to the .env key it writes.
interface KeySpec {
  shellVar: string
  envKey: string
  value: (key: string) => string
}

const SHARED_KEYS: KeySpec[] = [
  { shellVar: 'WORKTREE_DIR', envKey: 'WORKTREE_DIR', value: WITH_METACHARACTERS },
  {
    shellVar: 'API_KEY_CHECKSUM_SECRET',
    envKey: 'API_KEY_CHECKSUM_SECRET',
    value: WITH_METACHARACTERS,
  },
  {
    shellVar: 'VOUCHA_OTP_TOKEN_HASH_SECRET',
    envKey: 'VOUCHA_OTP_TOKEN_HASH_SECRET',
    value: WITH_APOSTROPHE,
  },
  {
    shellVar: 'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
    envKey: 'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
    value: WITH_METACHARACTERS,
  },
]

const WEB_KEYS: KeySpec[] = [
  { shellVar: 'CF_WORKER_SECRET', envKey: 'CF_WORKER_SECRET', value: WITH_METACHARACTERS },
  { shellVar: 'FINAL_WEB_PUSH_PUBLIC_KEY', envKey: 'WEB_PUSH_PUBLIC_KEY', value: WITH_APOSTROPHE },
  {
    shellVar: 'FINAL_WEB_PUSH_PUBLIC_KEY',
    envKey: 'NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY',
    value: WITH_APOSTROPHE,
  },
  {
    shellVar: 'FINAL_WEB_PUSH_PRIVATE_KEY',
    envKey: 'WEB_PUSH_PRIVATE_KEY',
    value: WITH_METACHARACTERS,
  },
  { shellVar: 'FINAL_WEB_PUSH_SUBJECT', envKey: 'WEB_PUSH_SUBJECT', value: WITH_METACHARACTERS },
  {
    shellVar: 'EFFECTIVE_TURNSTILE_SITE_KEY',
    envKey: 'NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY',
    value: WITH_METACHARACTERS,
  },
  {
    shellVar: 'EFFECTIVE_TURNSTILE_SECRET_KEY',
    envKey: 'CLOUDFLARE_TURNSTILE_SECRET_KEY',
    value: WITH_APOSTROPHE,
  },
  { shellVar: 'S3_AWS_ACCESS_KEY_ID', envKey: 'S3_AWS_ACCESS_KEY_ID', value: WITH_METACHARACTERS },
  {
    shellVar: 'S3_AWS_SECRET_ACCESS_KEY',
    envKey: 'S3_AWS_SECRET_ACCESS_KEY',
    value: WITH_APOSTROPHE,
  },
  { shellVar: 'S3_AWS_SESSION_TOKEN', envKey: 'S3_AWS_SESSION_TOKEN', value: WITH_METACHARACTERS },
]

const BACKEND_KEYS: KeySpec[] = [
  { shellVar: 'NODE_EXTRA_CA_CERTS', envKey: 'NODE_EXTRA_CA_CERTS', value: WITH_METACHARACTERS },
  { shellVar: 'AWS_ACCESS_KEY_ID', envKey: 'AWS_ACCESS_KEY_ID', value: WITH_APOSTROPHE },
  {
    shellVar: 'AWS_SECRET_ACCESS_KEY',
    envKey: 'AWS_SECRET_ACCESS_KEY',
    value: WITH_METACHARACTERS,
  },
  { shellVar: 'AWS_SESSION_TOKEN', envKey: 'AWS_SESSION_TOKEN', value: WITH_APOSTROPHE },
]

const DATABASE_URL_VALUE = (db: string) => `postgres://fake user:p$ss=w\\rd@localhost:15432/${db}`

// Reports stderr on failure, since the lint rules disallow an expect() message argument.
function expectExit0({ code, stderr }: { code: number | null; stderr: string }) {
  expect({ code, stderr }).toMatchObject({ code: 0 })
}

// Writes .env through write_worktree_env with the given synthetic shell values, then returns
// what a sourcing bash and `node --env-file` each read back, keyed by env var name.
async function writeAndReadEnv({
  cwd,
  mode,
  keys,
}: {
  cwd: string
  mode: 'backend' | 'web'
  keys: readonly KeySpec[]
}) {
  const expected: Record<string, string> = {}
  const shellValues: Record<string, string> = {}
  for (const { shellVar, envKey, value } of keys) {
    // Aliased keys (WEB_PUSH_PUBLIC_KEY and NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY) share one shell value.
    shellValues[shellVar] = value(shellVar)
    expected[envKey] = shellValues[shellVar]
  }
  const dbName = 'voucha-quoting-fake'
  shellValues.DATABASE_URL = DATABASE_URL_VALUE(dbName)
  expected.DATABASE_URL = shellValues.DATABASE_URL

  const assignments = Object.keys(shellValues)
    .map(name => `${name}="$QUOTING_${name}"`)
    .join('\n')
  const script = `
${assignments}
DB_NAME=${dbName}
MODE=${mode}
VALKEY_PORT=6379
BACKEND_PORT=3001
VALKEY_CONTAINER=voucha-valkey-test
WORKER_PORT=8788
IMAGE_LAMBDA_PORT=4001
NEXT_PORT=3002
STORYBOOK_PORT=6006
INSPECTOR_PORT=9229
export S3_AWS_ACCESS_KEY_ID S3_AWS_SECRET_ACCESS_KEY S3_AWS_SESSION_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
write_worktree_env >/dev/null
`
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: dirname(cwd) }
  for (const [name, value] of Object.entries(shellValues)) env[`QUOTING_${name}`] = value
  const written = await runProcess('bash', initializeBashArgs(script), { cwd, env })
  expectExit0(written)

  const dump = 'process.stdout.write(JSON.stringify(process.env))'
  const nodeRead = await runProcess(process.execPath, ['--env-file=.env', '-e', dump], {
    cwd,
    env: { PATH: process.env.PATH },
  })
  expectExit0(nodeRead)
  // HOME is the fixture parent, so the `~/voucha.env` include in .env finds nothing to source.
  const bashRead = await runSourcedBash(`${cwd}/.env`, `"$1" -e '${dump}'`, [process.execPath], {
    cwd,
    env: { PATH: process.env.PATH, HOME: env.HOME },
  })
  expectExit0(bashRead)

  return {
    expected,
    nodeEnv: JSON.parse(nodeRead.stdout) as Record<string, string>,
    sourcedEnv: JSON.parse(bashRead.stdout) as Record<string, string>,
  }
}

describe('worktree .env quoting round-trip', () => {
  afterEach(cleanupWorktreeDirs)

  it.each([
    { mode: 'web', keys: [...SHARED_KEYS, ...WEB_KEYS] },
    { mode: 'backend', keys: [...SHARED_KEYS, ...BACKEND_KEYS] },
  ] as const)(
    'reads every $mode-mode key identically through source and node --env-file',
    async ({ mode, keys }) => {
      const cwd = await makeWorktreeDir(`feature-env-quoting-${mode}`)

      const { expected, nodeEnv, sourcedEnv } = await writeAndReadEnv({ cwd, mode, keys })
      const pick = (env: Record<string, string>) =>
        Object.fromEntries(Object.keys(expected).map(key => [key, env[key]]))

      // The values are synthetic, so a mismatch may print them in full.
      expect(pick(nodeEnv)).toEqual(expected)
      expect(pick(sourcedEnv)).toEqual(expected)
    },
  )

  it('refuses a value no shared spelling can represent and names only the key', async () => {
    const cwd = await makeWorktreeDir('feature-env-quoting-reject')
    const secret = `fake-reject it's "mixed" $value`

    const result = await runProcess(
      'bash',
      initializeBashArgs(`
DB_NAME=voucha-quoting-reject
MODE=backend
VALKEY_PORT=6379
BACKEND_PORT=3001
VALKEY_CONTAINER=voucha-valkey-test
WORKER_PORT=8788
IMAGE_LAMBDA_PORT=4001
NEXT_PORT=3002
STORYBOOK_PORT=6006
INSPECTOR_PORT=9229
WORKTREE_DIR=feature-env-quoting-reject
API_KEY_CHECKSUM_SECRET="$QUOTING_SECRET"
VOUCHA_OTP_TOKEN_HASH_SECRET=otp
VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
write_worktree_env >/dev/null
`),
      {
        cwd,
        env: { PATH: process.env.PATH, HOME: dirname(cwd), QUOTING_SECRET: secret },
      },
    )

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('API_KEY_CHECKSUM_SECRET')
    expect(result.stderr).not.toContain('fake-reject')
    expect(result.stdout).not.toContain('fake-reject')
  })
})
