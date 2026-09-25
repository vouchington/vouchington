import { execFile } from 'node:child_process'

import { mkdir, mkdtemp, rm } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { dirname, join } from 'node:path'

import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs, runInitializeHelperStatus } from '../../test-helpers/initialize.mts'

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

describe('initialize secrets and S3 helpers', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('allows blank or incomplete S3 credential pairs with opt-in setup guidance', async () => {
    const cwd = await makeWorktreeDir('feature-s3-credentials-incomplete')

    const result = await runInitializeHelperStatus({
      cwd,
      script: `
      S3_AWS_ACCESS_KEY_ID='   '
      S3_AWS_SECRET_ACCESS_KEY=s3-secret-key
      AWS_ACCESS_KEY_ID=aws-access-key
      AWS_SECRET_ACCESS_KEY='   '
      validate_s3_credentials >/dev/null
      `,
    })

    expect(result.code).toBe(0)
    expect(result.stderr).toContain('S3 credentials are not configured')
    expect(result.stderr).toContain('The app can start')
    expect(result.stderr).toContain('S3_AWS_SECRET_ACCESS_KEY')
    expect(result.stderr).toContain('AWS_SECRET_ACCESS_KEY')
  })

  it('writes the S3 credential pair to worktree .env', async () => {
    const cwd = await makeWorktreeDir('feature-s3-credentials-write')

    const output = await runHelper({
      cwd,
      script: `
      VALKEY_PORT=6500
      BACKEND_PORT=4500
      DB_NAME=voucha-feature-s3-credentials-write
      VALKEY_CONTAINER=voucha-valkey-feature-s3-credentials-write
      NEXT_PORT=4501
      WORKER_PORT=4502
      IMAGE_LAMBDA_PORT=4503
      INSPECTOR_PORT=4504
      STORYBOOK_PORT=4505
      CF_WORKER_SECRET=cf-worker-secret-that-is-at-least-32-chars
      API_KEY_CHECKSUM_SECRET='this is a fake test API key checksum secret'
      VOUCHA_OTP_TOKEN_HASH_SECRET='this is a fake test OTP HMAC secret'
      VOUCHA_STORED_SECRET_ENCRYPTION_KEYS='fake-test-key:raw32:this fake test key is not secret'
      S3_AWS_ACCESS_KEY_ID=s3-access-key
      S3_AWS_SECRET_ACCESS_KEY=s3-secret-key
      S3_AWS_SESSION_TOKEN=s3-session-token
      FINAL_WEB_PUSH_PUBLIC_KEY=web-push-public
      FINAL_WEB_PUSH_PRIVATE_KEY=web-push-private
      FINAL_WEB_PUSH_SUBJECT=mailto:tests+local@voucha.ai
      write_worktree_env >/dev/null
      source .env >/dev/null 2>&1
      printf '%s' "$S3_AWS_ACCESS_KEY_ID|$S3_AWS_SECRET_ACCESS_KEY|$S3_AWS_SESSION_TOKEN"
      `,
    })

    expect(output).toBe('s3-access-key|s3-secret-key|s3-session-token')
  })

  it('writes local runtime identity and suppresses Node DEP0205 warnings in worktree .env', async () => {
    const cwd = await makeWorktreeDir('feature-image-origin-node-options')

    const output = await runHelper({
      cwd,
      script: `
      VALKEY_PORT=6500
      BACKEND_PORT=4500
      DB_NAME=voucha-feature-image-origin-node-options
      VALKEY_CONTAINER=voucha-valkey-feature-image-origin-node-options
      NEXT_PORT=4501
      WORKER_PORT=4502
      IMAGE_LAMBDA_PORT=4503
      INSPECTOR_PORT=4504
      STORYBOOK_PORT=4505
      CF_WORKER_SECRET=cf-worker-secret-that-is-at-least-32-chars
      API_KEY_CHECKSUM_SECRET='this is a fake test API key checksum secret'
      VOUCHA_OTP_TOKEN_HASH_SECRET='this is a fake test OTP HMAC secret'
      VOUCHA_STORED_SECRET_ENCRYPTION_KEYS='fake-test-key:raw32:this fake test key is not secret'
      FINAL_WEB_PUSH_PUBLIC_KEY=web-push-public
      FINAL_WEB_PUSH_PRIVATE_KEY=web-push-private
      FINAL_WEB_PUSH_SUBJECT=mailto:tests+local@voucha.ai
      write_worktree_env >/dev/null
      source .env >/dev/null 2>&1
      printf '%s|%s|%s' "$IMAGE_ORIGIN" "$NODE_OPTIONS" "$ENVIRONMENT"
      `,
    })

    const [imageOrigin, nodeOptions, environment] = output.split('|')
    expect(imageOrigin).toBe('http://localhost:4503')
    expect(nodeOptions?.split(/\s+/)).toContain('--disable-warning=DEP0205')
    expect(environment).toBe('development')
  })

  it('derives Worker browser-upload origins from the dedicated local upload bucket', async () => {
    const cwd = await makeWorktreeDir('feature-worker-upload-origins')

    const output = await runHelper({
      cwd,
      script: `
      mkdir -p cloudflare-worker
      BACKEND_PORT=4500
      NEXT_PORT=4501
      S3_BUCKET_IMAGES=developer-images
      S3_BUCKET_IMAGE_UPLOADS=developer-image-uploads
      CF_WORKER_SECRET=cf-worker-secret-that-is-at-least-32-chars
      write_worker_env >/dev/null
      grep '^CSP_BROWSER_UPLOAD_ORIGINS=' cloudflare-worker/.dev.vars
      `,
    })

    expect(output).toBe(
      'CSP_BROWSER_UPLOAD_ORIGINS=["https://developer-image-uploads.s3.us-west-2.amazonaws.com","https://developer-image-uploads.s3.dualstack.us-west-2.amazonaws.com"]',
    )
  })

  it('writes fallback AWS credentials to worktree .env when S3-specific credentials are absent', async () => {
    const cwd = await makeWorktreeDir('feature-s3-fallback-credentials-write')

    const output = await runHelper({
      cwd,
      script: `
      VALKEY_PORT=6500
      BACKEND_PORT=4500
      DB_NAME=voucha-feature-s3-fallback-credentials-write
      VALKEY_CONTAINER=voucha-valkey-feature-s3-fallback-credentials-write
      NEXT_PORT=4501
      WORKER_PORT=4502
      IMAGE_LAMBDA_PORT=4503
      INSPECTOR_PORT=4504
      STORYBOOK_PORT=4505
      CF_WORKER_SECRET=cf-worker-secret-that-is-at-least-32-chars
      API_KEY_CHECKSUM_SECRET='this is a fake test API key checksum secret'
      VOUCHA_OTP_TOKEN_HASH_SECRET='this is a fake test OTP HMAC secret'
      VOUCHA_STORED_SECRET_ENCRYPTION_KEYS='fake-test-key:raw32:this fake test key is not secret'
      unset S3_AWS_ACCESS_KEY_ID
      unset S3_AWS_SECRET_ACCESS_KEY
      unset S3_AWS_SESSION_TOKEN
      AWS_ACCESS_KEY_ID=aws-access-key
      AWS_SECRET_ACCESS_KEY=aws-secret-key
      AWS_SESSION_TOKEN=aws-session-token
      FINAL_WEB_PUSH_PUBLIC_KEY=web-push-public
      FINAL_WEB_PUSH_PRIVATE_KEY=web-push-private
      FINAL_WEB_PUSH_SUBJECT=mailto:tests+local@voucha.ai
      write_worktree_env >/dev/null
      source .env >/dev/null 2>&1
      printf '%s' "$AWS_ACCESS_KEY_ID|$AWS_SECRET_ACCESS_KEY|$AWS_SESSION_TOKEN"
      `,
    })

    expect(output).toBe('aws-access-key|aws-secret-key|aws-session-token')
  })

  it('omits S3 credential exports from worktree .env when credentials are absent', async () => {
    const cwd = await makeWorktreeDir('feature-s3-no-credentials-write')

    const output = await runHelper({
      cwd,
      script: `
      VALKEY_PORT=6500
      BACKEND_PORT=4500
      DB_NAME=voucha-feature-s3-no-credentials-write
      VALKEY_CONTAINER=voucha-valkey-feature-s3-no-credentials-write
      NEXT_PORT=4501
      WORKER_PORT=4502
      IMAGE_LAMBDA_PORT=4503
      INSPECTOR_PORT=4504
      STORYBOOK_PORT=4505
      CF_WORKER_SECRET=cf-worker-secret-that-is-at-least-32-chars
      API_KEY_CHECKSUM_SECRET='this is a fake test API key checksum secret'
      VOUCHA_OTP_TOKEN_HASH_SECRET='this is a fake test OTP HMAC secret'
      VOUCHA_STORED_SECRET_ENCRYPTION_KEYS='fake-test-key:raw32:this fake test key is not secret'
      unset S3_AWS_ACCESS_KEY_ID
      unset S3_AWS_SECRET_ACCESS_KEY
      unset S3_AWS_SESSION_TOKEN
      unset AWS_ACCESS_KEY_ID
      unset AWS_SECRET_ACCESS_KEY
      unset AWS_SESSION_TOKEN
      FINAL_WEB_PUSH_PUBLIC_KEY=web-push-public
      FINAL_WEB_PUSH_PRIVATE_KEY=web-push-private
      FINAL_WEB_PUSH_SUBJECT=mailto:tests+local@voucha.ai
      write_worktree_env >/dev/null
      if grep -E '^(export )?(S3_AWS|AWS)_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)=' .env >/dev/null; then
        printf 'found'
      else
        printf 'omitted'
      fi
      `,
    })

    expect(output).toBe('omitted')
  })
})
