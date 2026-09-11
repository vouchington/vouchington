import { execFile } from 'node:child_process'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { dirname, join } from 'node:path'

import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs } from '../../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)

const testDirs: string[] = []

async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runHelper({ cwd, script, home }: { cwd: string; script: string; home?: string }) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: {
      ...process.env,
      HOME: home ?? dirname(cwd),
    },
  })

  return result.stdout.trim()
}

async function runHelperStatus({
  cwd,
  script,
  home,
}: {
  cwd: string
  script: string
  home?: string
}): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  try {
    const result = await execFileAsync('bash', initializeBashArgs(script), {
      cwd,
      env: {
        ...process.env,
        HOME: home ?? dirname(cwd),
      },
    })

    return { exitCode: 0, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; stdout?: string }
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stderr: (e.stderr ?? '').trim(),
      stdout: (e.stdout ?? '').trim(),
    }
  }
}

describe('initialize secrets and S3 helpers', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses CF_WORKER_SECRET from shared environment when already set', async () => {
    const cwd = await makeWorktreeDir('feature-cf-secret-shared')

    const output = await runHelper({
      cwd,
      script: `
      CF_WORKER_SECRET=shared-test-secret-that-is-at-least-32-chars
      configure_cf_worker_secret >/dev/null
      printf '%s' "$CF_WORKER_SECRET"
      `,
    })

    expect(output).toBe('shared-test-secret-that-is-at-least-32-chars')
  })

  it('reuses existing CF_WORKER_SECRET from .env when shared env is absent', async () => {
    const cwd = await makeWorktreeDir('feature-cf-secret-reuse')

    await writeFile(
      join(cwd, '.env'),
      `export CF_WORKER_${'SECRET'}=existing-test-secret-at-least-32-chars
  `,
    )

    const output = await runHelper({
      cwd,
      script: `
      unset CF_WORKER_SECRET
      configure_cf_worker_secret >/dev/null
      printf '%s' "$CF_WORKER_SECRET"
      `,
    })

    expect(output).toBe('existing-test-secret-at-least-32-chars')
  })

  it('generates a new CF_WORKER_SECRET when none exists', async () => {
    const cwd = await makeWorktreeDir('feature-cf-secret-generate')

    const output = await runHelper({
      cwd,
      script: `
      unset CF_WORKER_SECRET
      configure_cf_worker_secret >/dev/null
      printf '%s' "$CF_WORKER_SECRET"
      `,
    })

    expect(output).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reuses token storage secrets from existing .env when shared env is absent', async () => {
    const cwd = await makeWorktreeDir('feature-token-storage-secret-reuse')

    await writeFile(
      join(cwd, '.env'),
      `export VOUCHA_OTP_TOKEN_HASH_SECRET='this is an existing fake OTP HMAC secret'
  export VOUCHA_STORED_SECRET_ENCRYPTION_KEYS='existing-fake-key:raw32:this fake test key is not secret'
  `,
    )

    const output = await runHelper({
      cwd,
      script: `
      unset VOUCHA_OTP_TOKEN_HASH_SECRET
      unset VOUCHA_STORED_SECRET_ENCRYPTION_KEYS
      configure_token_storage_secrets >/dev/null
      printf '%s' "$VOUCHA_OTP_TOKEN_HASH_SECRET|$VOUCHA_STORED_SECRET_ENCRYPTION_KEYS"
      `,
    })

    expect(output).toBe(
      'this is an existing fake OTP HMAC secret|existing-fake-key:raw32:this fake test key is not secret',
    )
  })

  it('reuses existing local web push keys when shared env keys are absent', async () => {
    const cwd = await makeWorktreeDir('feature-web-push')
    const home = join(dirname(cwd), 'home')

    await mkdir(home, { recursive: true })
    await writeFile(
      join(cwd, '.env'),
      `export WEB_PUSH_PUBLIC_KEY=local-public
      export WEB_PUSH_PRIVATE_KEY=local-private
      export WEB_PUSH_SUBJECT=mailto:tests+local@voucha.ai
      `,
    )

    const output = await runHelper({
      cwd,
      home,
      script: `
      unset WEB_PUSH_PUBLIC_KEY
      unset WEB_PUSH_PRIVATE_KEY
      unset WEB_PUSH_SUBJECT
      configure_web_push_keys >/dev/null
      printf '%s' "$FINAL_WEB_PUSH_PUBLIC_KEY|$FINAL_WEB_PUSH_PRIVATE_KEY|$FINAL_WEB_PUSH_SUBJECT"
      `,
    })

    expect(output).toBe('local-public|local-private|mailto:tests+local@voucha.ai')
  })

  it('accepts S3-specific credentials for web initialization', async () => {
    const cwd = await makeWorktreeDir('feature-s3-credentials')

    const output = await runHelper({
      cwd,
      script: `
      S3_AWS_ACCESS_KEY_ID=s3-access-key
      S3_AWS_SECRET_ACCESS_KEY=s3-secret-key
      validate_s3_credentials >/dev/null
      printf 'ok'
      `,
    })

    expect(output).toBe('ok')
  })

  it('accepts fallback AWS credentials for S3', async () => {
    const cwd = await makeWorktreeDir('feature-s3-fallback-credentials')

    const output = await runHelper({
      cwd,
      script: `
      unset S3_AWS_ACCESS_KEY_ID
      unset S3_AWS_SECRET_ACCESS_KEY
      AWS_ACCESS_KEY_ID=aws-access-key
      AWS_SECRET_ACCESS_KEY=aws-secret-key
      validate_s3_credentials >/dev/null
      printf 'ok'
      `,
    })

    expect(output).toBe('ok')
  })

  it('allows missing S3 credentials with opt-in setup guidance', async () => {
    const cwd = await makeWorktreeDir('feature-s3-credentials-missing')

    const result = await runHelperStatus({
      cwd,
      script: `
      unset S3_AWS_ACCESS_KEY_ID
      unset S3_AWS_SECRET_ACCESS_KEY
      unset AWS_ACCESS_KEY_ID
      unset AWS_SECRET_ACCESS_KEY
      validate_s3_credentials >/dev/null
      `,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain('S3 credentials are not configured')
    expect(result.stderr).toContain('The app can start')
    expect(result.stderr).toContain('~/voucha.env')
    expect(result.stderr).toContain('export S3_AWS_ACCESS_KEY_ID=')
    expect(result.stderr).toContain('export AWS_ACCESS_KEY_ID=')
  })
})
