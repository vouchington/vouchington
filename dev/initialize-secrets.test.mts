import { symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupWorktreeDirs,
  makeWorktreeDir,
  runInitializeHelper,
} from './test-helpers/initialize.mts'

describe('initialize-secrets', () => {
  afterEach(cleanupWorktreeDirs)

  describe('dev/initialize secret helpers', () => {
    it('sources initialize from a worktree path containing spaces and apostrophes', async () => {
      const cwd = await makeWorktreeDir("feature path's initializer")
      const linkedRepository = join(cwd, "linked repo's source")
      await symlink(fileURLToPath(new URL('../', import.meta.url)), linkedRepository, 'dir')

      const output = await runInitializeHelper({
        cwd,
        script: 'sanitize_worktree_dir "$1"',
        args: ['voucha!'],
        sourcePath: join(linkedRepository, 'dev', 'initialize'),
      })

      expect(output).toBe('voucha')
    })

    it('fails before running the script when the source cannot be loaded', async () => {
      const cwd = await makeWorktreeDir('missing-initialize-source')

      await expect(
        runInitializeHelper({
          cwd,
          script: 'printf should-not-run',
          sourcePath: join(cwd, 'missing-initialize'),
        }),
      ).rejects.toThrow('Command failed')
    })

    it('uses API_KEY_CHECKSUM_SECRET from shared environment when already set', async () => {
      const cwd = await makeWorktreeDir('feature-api-key-secret-shared')

      const output = await runInitializeHelper({
        cwd,
        script: `
  API_KEY_CHECKSUM_SECRET='this is a fake shared API key checksum secret'
  configure_api_key_checksum_secret >/dev/null
  printf '%s' "$API_KEY_CHECKSUM_SECRET"
  `,
      })

      expect(output).toBe('this is a fake shared API key checksum secret')
    })

    it('reuses existing API_KEY_CHECKSUM_SECRET from .env when shared env is absent', async () => {
      const cwd = await makeWorktreeDir('feature-api-key-secret-reuse')

      await writeFile(
        join(cwd, '.env'),
        `export API_KEY_CHECKSUM_SECRET='this is a fake existing API key checksum secret'
  `,
      )

      const output = await runInitializeHelper({
        cwd,
        script: `
  unset API_KEY_CHECKSUM_SECRET
  configure_api_key_checksum_secret >/dev/null
  printf '%s' "$API_KEY_CHECKSUM_SECRET"
  `,
      })

      expect(output).toBe('this is a fake existing API key checksum secret')
    })

    it('uses the development API_KEY_CHECKSUM_SECRET when none exists', async () => {
      const cwd = await makeWorktreeDir('feature-api-key-secret-default')
      await writeFile(
        join(cwd, '.env.example'),
        "export API_KEY_CHECKSUM_SECRET='this is a fake template API key checksum secret'\n",
      )

      const output = await runInitializeHelper({
        cwd,
        script: `
  unset API_KEY_CHECKSUM_SECRET
  configure_api_key_checksum_secret >/dev/null
  printf '%s' "$API_KEY_CHECKSUM_SECRET"
  `,
      })

      expect(output).toBe('this is a fake template API key checksum secret')
    })

    it('fails when API_KEY_CHECKSUM_SECRET is missing from .env.example', async () => {
      const cwd = await makeWorktreeDir('feature-api-key-secret-missing-default')
      await writeFile(join(cwd, '.env.example'), 'export OTHER_SECRET=value\n')

      await expect(
        runInitializeHelper({
          cwd,
          script: `
  unset API_KEY_CHECKSUM_SECRET
  configure_api_key_checksum_secret >/dev/null
  `,
        }),
      ).rejects.toThrow(Error)
    })

    it('writes API_KEY_CHECKSUM_SECRET to worktree .env', async () => {
      const cwd = await makeWorktreeDir('feature-api-key-secret-write')

      const output = await runInitializeHelper({
        cwd,
        script: `
  VALKEY_PORT=6500
  BACKEND_PORT=4500
  DB_NAME=voucha-feature-api-key-secret-write
  VALKEY_CONTAINER=voucha-valkey-feature-api-key-secret-write
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
  printf '%s' "$API_KEY_CHECKSUM_SECRET"
  `,
      })

      expect(output).toBe('this is a fake test API key checksum secret')
    })
  })
})
