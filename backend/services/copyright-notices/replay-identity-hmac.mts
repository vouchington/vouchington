import { createHmac } from 'node:crypto'

const COPYRIGHT_REPLAY_HMAC_KEYS_ENV = 'VOUCHA_COPYRIGHT_REPLAY_HMAC_KEYS'
const MAX_KEY_SLOTS = 32
const MAX_RING_BYTES = 4096

type HmacKey = { id: string; key: Buffer }
export type CopyrightReplayDigest = { keyId: string; digest: Buffer }
export type CopyrightReplayPurpose =
  | 'notice-admission'
  | 'redress-admission'
  | 'acknowledgment'
  | 'requester'
  | 'request'
  | 'idempotency'
  | 'key-version'

/** Dedicated material, independent of OTP hashing and stored-secret encryption keys. */
function withCopyrightReplayKeys<Result>(handler: (keys: readonly HmacKey[]) => Result): Result {
  const value = process.env[COPYRIGHT_REPLAY_HMAC_KEYS_ENV]?.trim()
  const keys: HmacKey[] = []
  try {
    if (!value || Buffer.byteLength(value) > MAX_RING_BYTES) throw new Error('invalid-ring')
    const entries = value.split(',')
    if (entries.length > MAX_KEY_SLOTS) throw new Error('invalid-ring')
    for (const entry of entries) {
      const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,31}):([A-Za-z0-9+/]{43}=)$/.exec(entry.trim())
      if (!match || keys.some(key => key.id === match[1])) throw new Error('invalid-ring')
      const material = Buffer.from(match[2]!, 'base64')
      keys.push({ id: match[1]!, key: material })
      if (material.length !== 32 || material.toString('base64') !== match[2])
        throw new Error('invalid-ring')
    }
    return handler(keys)
  } catch (err) {
    if (err instanceof Error && err.message === 'invalid-ring')
      throw new Error(
        `${COPYRIGHT_REPLAY_HMAC_KEYS_ENV} must contain unique versioned 32-byte keys`,
        { cause: err },
      )
    throw err
  } finally {
    for (const key of keys) key.key.fill(0)
  }
}

function digest(
  key: HmacKey,
  purpose: CopyrightReplayPurpose,
  value: string,
): CopyrightReplayDigest {
  return {
    keyId: key.id,
    digest: createHmac('sha256', key.key)
      .update(JSON.stringify(['copyright-dsa-replay', purpose, value]))
      .digest(),
  }
}

/** New identities use the first slot; callers retain its ID alongside the digest. */
export function createCopyrightReplayDigest(
  purpose: CopyrightReplayPurpose,
  value: string,
): CopyrightReplayDigest {
  return withCopyrightReplayKeys(keys => digest(keys[0]!, purpose, value))
}

/** Exact replay looks up every retained slot, never an unkeyed or unrelated-secret fallback. */
export function copyrightReplayDigestCandidates(
  purpose: CopyrightReplayPurpose,
  value: string,
): CopyrightReplayDigest[] {
  return withCopyrightReplayKeys(keys => keys.map(key => digest(key, purpose, value)))
}

export function copyrightReplayKeyMetadata(): Array<{
  id: string
  materialVerificationHmac: Buffer
}> {
  return withCopyrightReplayKeys(keys =>
    keys.map(key => ({
      id: key.id,
      materialVerificationHmac: digest(key, 'key-version', 'dedicated-key-material-verification')
        .digest,
    })),
  )
}
