import { describe, expect, it } from 'vitest'
import {
  createCopyrightKeyNotice,
  readCopyrightKeyReservation,
  useCopyrightKeyObjectFaults,
} from '@voucha/test-helpers/copyright-encryption-keys'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { prepareCopyrightEncryptionKey, openCopyrightSecrets } from './encryption-keys.mts'
import { reclaimCopyrightEncryptionKeyReservation } from './encryption-key-orphan-reservation.mts'

describe('copyright owner key authority', () => {
  useCopyrightIntakeEnvironment()
  const provider = useCopyrightKeyObjectFaults()

  it('binds prepared handles to their exact owner and rejects retained disposed capabilities', async () => {
    await using prepared = await prepareCopyrightEncryptionKey('notice')
    const owner = await createCopyrightKeyNotice(prepared)
    expect(() =>
      prepared.encrypt('wrong owner', owner.purpose, { kind: 'notice', id: crypto.randomUUID() }),
    ).toThrow('owner mismatch')
    await using scope = await openCopyrightSecrets({ kind: 'notice', id: owner.noticeId })
    expect(scope.decryptSecret(owner.ciphertext, owner.purpose)).toBe('Synthetic claimant contact')
    const retainedEncrypt = scope.encryptSecret
    const retainedDecrypt = scope.decryptSecret
    await scope[Symbol.asyncDispose]()
    expect(() => retainedEncrypt('late write', owner.purpose)).toThrow('disposed')
    expect(() => retainedDecrypt(owner.ciphertext, owner.purpose)).toThrow('disposed')
    await prepared[Symbol.asyncDispose]()
    expect(() =>
      prepared.encrypt('late write', owner.purpose, { kind: 'notice', id: owner.noticeId }),
    ).toThrow('disposed')
  })

  it('refuses cross-case ciphertext and missing authoritative keys without a global-key fallback', async () => {
    await using firstKey = await prepareCopyrightEncryptionKey('notice')
    await using secondKey = await prepareCopyrightEncryptionKey('notice')
    const first = await createCopyrightKeyNotice(firstKey)
    const second = await createCopyrightKeyNotice(secondKey)
    await using secondScope = await openCopyrightSecrets({ kind: 'notice', id: second.noticeId })
    expect(() => secondScope.decryptSecret(first.ciphertext, first.purpose)).toThrow(
      'does not belong',
    )
    provider.refuseKeyRead(first.keyId)
    await expect(openCopyrightSecrets({ kind: 'notice', id: first.noticeId })).rejects.toThrow(
      'Missing authoritative',
    )
  })

  it('reclaims a durably tracked upload after its acknowledgment is lost', async () => {
    provider.loseNextUploadAcknowledgment()
    await expect(prepareCopyrightEncryptionKey('notice')).rejects.toThrow(
      'Lost copyright key upload acknowledgment',
    )
    const keyId = provider.lostUploadKeyId()
    expect(await readCopyrightKeyReservation(keyId)).toEqual({
      object_created_at: null,
      destroyed_at: null,
    })
    expect(
      await reclaimCopyrightEncryptionKeyReservation(keyId, new Date(Date.now() + 3 * 86_400_000)),
    ).toBe(true)
    expect(await readCopyrightKeyReservation(keyId)).toBeNull()
  })

  it('reclaims producer rollback orphans while preserving an attached live owner', async () => {
    await using abandoned = await prepareCopyrightEncryptionKey('notice')
    await using live = await prepareCopyrightEncryptionKey('notice')
    await createCopyrightKeyNotice(abandoned, true)
    const owner = await createCopyrightKeyNotice(live)
    const retentionNow = new Date(Date.now() + 3 * 86_400_000)
    expect(await reclaimCopyrightEncryptionKeyReservation(abandoned.id, retentionNow)).toBe(true)
    expect(await reclaimCopyrightEncryptionKeyReservation(live.id, retentionNow)).toBe(false)
    await using scope = await openCopyrightSecrets({ kind: 'notice', id: owner.noticeId })
    expect(scope.decryptSecret(owner.ciphertext, owner.purpose)).toBe('Synthetic claimant contact')
  })
})
