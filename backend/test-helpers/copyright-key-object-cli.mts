import { S3Client } from '@aws-sdk/client-s3'
import { hasS3Credentials } from '../modules/aws/credentials.mts'
import {
  copyrightKeyObjectStoreRoot,
  handleCopyrightKeyObjectCommand,
} from './copyright-key-object-store.mts'

const BUCKET_ENV = 'S3_BUCKET_COPYRIGHT_EVIDENCE'
let installed = false

function requireFixtureEnvironment(): void {
  copyrightKeyObjectStoreRoot()
  const bucket = process.env[BUCKET_ENV]?.trim()
  if (!bucket || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(bucket))
    throw new Error(`${BUCKET_ENV} must be explicitly set to the copyright evidence bucket`)
}

function isCopyrightKeyObject(command: unknown): boolean {
  if (!command || typeof command !== 'object' || !('input' in command)) return false
  const input = (command as { input?: Record<string, unknown> }).input
  if (!input || input.Bucket !== process.env[BUCKET_ENV]?.trim()) return false
  if (typeof input.Key === 'string' && input.Key.startsWith('retention-keys/')) return true
  if (typeof input.Prefix === 'string' && input.Prefix.startsWith('retention-keys/')) return true
  const objects = (input.Delete as { Objects?: Array<{ Key?: unknown }> } | undefined)?.Objects
  return Boolean(
    objects?.length &&
    objects.every(item => typeof item.Key === 'string' && item.Key.startsWith('retention-keys/')),
  )
}

/**
 * Serves copyright retention-key objects from the file fixture at the `send` boundary, so no
 * network call is made. Every other command keeps the caller's existing `send` behavior.
 */
export function installCopyrightKeyObjectCliPreload(): void {
  if (installed) return
  requireFixtureEnvironment()
  // The lazy images client rejects missing local credentials before it sends. Fixture-owned keys
  // never leave the process, so launchers without AWS access get inert synthetic credentials.
  if (!hasS3Credentials()) {
    process.env.S3_AWS_ACCESS_KEY_ID = 'copyright-key-fixture'
    process.env.S3_AWS_SECRET_ACCESS_KEY = 'copyright-key-fixture-secret'
  }
  const send = S3Client.prototype.send
  S3Client.prototype.send = function sendWithCopyrightKeyFixture(this: S3Client, command: never) {
    const fixtureResult = isCopyrightKeyObject(command)
      ? handleCopyrightKeyObjectCommand(command)
      : null
    return fixtureResult ?? (send as (command: never) => Promise<unknown>).call(this, command)
  } as never
  installed = true
}

// Node's `--import` loads this module before the seed or explain entrypoint. Matching
// copyright retention-key operations use the file fixture; other S3 behavior is preserved.
installCopyrightKeyObjectCliPreload()
