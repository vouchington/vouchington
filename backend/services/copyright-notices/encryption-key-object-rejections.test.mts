import { describe, expect, it } from 'vitest'
import {
  createCopyrightKeyNotice,
  readCopyrightKeyReservation,
  useCopyrightKeyObjectFaults,
} from '@voucha/test-helpers/copyright-encryption-keys'
import { destroyTestCopyrightNoticeKeyWithoutErasureMarker } from '@voucha/test-helpers/copyright-email-manual-association'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { openCopyrightSecrets, prepareCopyrightEncryptionKey } from './encryption-keys.mts'

describe('copyright authoritative key provider failures', () => {
  useCopyrightIntakeEnvironment()
  const provider = useCopyrightKeyObjectFaults()

  it.each([
    ['missing_body', 'Invalid copyright encryption key object'],
    ['declared_oversized', 'Invalid copyright encryption key object'],
    ['stream_oversized', 'Copyright encryption key object is too large'],
  ] as const)(
    'refuses a %s provider body without opening owner secrets',
    async (fault, message) => {
      await using prepared = await prepareCopyrightEncryptionKey('notice')
      const owner = await createCopyrightKeyNotice(prepared)
      provider.corruptKeyRead(owner.keyId, fault)

      await expect(openCopyrightSecrets({ kind: 'notice', id: owner.noticeId })).rejects.toThrow(
        message,
      )
      await expect(readCopyrightKeyReservation(owner.keyId)).resolves.toMatchObject({
        destroyed_at: null,
      })
    },
  )

  it('refuses truncated immutable-version listings before destroying key authority', async () => {
    await using prepared = await prepareCopyrightEncryptionKey('notice')
    const owner = await createCopyrightKeyNotice(prepared)
    provider.truncateKeyVersions(owner.keyId)

    await expect(destroyTestCopyrightNoticeKeyWithoutErasureMarker(owner.noticeId)).rejects.toThrow(
      'violates immutable-version admission',
    )
    await expect(readCopyrightKeyReservation(owner.keyId)).resolves.toMatchObject({
      destroyed_at: null,
    })
    await using secrets = await openCopyrightSecrets({ kind: 'notice', id: owner.noticeId })
    expect(secrets.decryptSecret(owner.ciphertext, owner.purpose)).toBe(
      'Synthetic claimant contact',
    )
  })

  it('does not record key destruction when a provider acknowledges but retains a version', async () => {
    await using prepared = await prepareCopyrightEncryptionKey('notice')
    const owner = await createCopyrightKeyNotice(prepared)
    provider.retainKeyVersionOnDelete(owner.keyId)

    await expect(destroyTestCopyrightNoticeKeyWithoutErasureMarker(owner.noticeId)).rejects.toThrow(
      'Copyright key object versions remain',
    )
    await expect(readCopyrightKeyReservation(owner.keyId)).resolves.toMatchObject({
      destroyed_at: null,
    })
    await using secrets = await openCopyrightSecrets({ kind: 'notice', id: owner.noticeId })
    expect(secrets.decryptSecret(owner.ciphertext, owner.purpose)).toBe(
      'Synthetic claimant contact',
    )
  })
})
