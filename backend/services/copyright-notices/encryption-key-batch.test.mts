import { describe, expect, it } from 'vitest'
import {
  createCopyrightKeyNotice,
  readCopyrightKeyReservation,
  useCopyrightKeyObjectFaults,
  withCopyrightBatchTransactions,
} from '@voucha/test-helpers/copyright-encryption-keys'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightRetentionWindows } from './config.mts'
import { lockCopyrightIntakeCaseLifetimes } from './encryption-intake-lifetimes.mts'
import {
  openCopyrightOwnerSecretBatch,
  openCopyrightDeliverySecretBatch,
} from './encryption-key-batch.mts'
import { prepareCopyrightEncryptionKey, openCopyrightSecrets } from './encryption-keys.mts'
import { lockCopyrightNoticeLifetime } from './notice-lifetime.mts'
import { getPendingCopyrightStaffCases } from './read-models-staff-case.mts'

describe('copyright batch capability lifetime', () => {
  useCopyrightIntakeEnvironment()
  const provider = useCopyrightKeyObjectFaults()
  it('keeps a case lifetime capability in its original transaction and notice scope', async () => {
    await using prepared = await prepareCopyrightEncryptionKey('notice')
    const fixture = await createCopyrightKeyNotice(prepared)
    await withCopyrightBatchTransactions(async (query, other) => {
      const lifetime = await lockCopyrightNoticeLifetime(query, fixture.noticeId)
      expect(lifetime.covers(query, fixture.noticeId)).toBe(true)
      expect(lifetime.covers(query, crypto.randomUUID())).toBe(false)
      expect(() => lifetime.covers(other, fixture.noticeId)).toThrow('outside its transaction')
    })
  })

  it('refuses use in a different transaction and after disposal', async () => {
    await using prepared = await prepareCopyrightEncryptionKey('notice')
    const fixture = await createCopyrightKeyNotice(prepared)
    const owner = { kind: 'notice' as const, id: fixture.noticeId }
    await withCopyrightBatchTransactions(async (query, other) => {
      await using batch = await openCopyrightOwnerSecretBatch([owner], query, 'read')
      const scope = batch.get(owner)
      expect(scope.decryptSecret(fixture.ciphertext, fixture.purpose)).toBe(
        'Synthetic claimant contact',
      )
      expect(() => batch.assertTransaction(other)).toThrow('outside its transaction scope')
      await batch[Symbol.asyncDispose]()
      expect(() => batch.get(owner)).toThrow('outside its transaction scope')
      expect(() => scope.decryptSecret(fixture.ciphertext, fixture.purpose)).toThrow('disposed')
    })
  })

  it('rejects owner, delivery and intake lifetime requests beyond the configured cap', async () => {
    const ids = Array.from(
      { length: getCopyrightRetentionWindows().encryptionOwnerBatchSize + 1 },
      () => crypto.randomUUID(),
    )
    await withCopyrightBatchTransactions(async query => {
      await expect(
        openCopyrightOwnerSecretBatch(
          ids.map(id => ({ kind: 'notice', id })),
          query,
        ),
      ).rejects.toThrow('owner batch exceeds its cap')
      await expect(openCopyrightDeliverySecretBatch(ids, query)).rejects.toThrow(
        'delivery encryption batch exceeds its cap',
      )
      await expect(lockCopyrightIntakeCaseLifetimes(query, ids)).rejects.toThrow(
        'intake lifetime page exceeds its cap',
      )
      await expect(getPendingCopyrightStaffCases(ids, query)).rejects.toThrow(
        'staff case page exceeds its owner-key cap',
      )
    })
  })

  it('fails the entire batch when an authoritative provider read fails', async () => {
    await using firstKey = await prepareCopyrightEncryptionKey('notice')
    await using secondKey = await prepareCopyrightEncryptionKey('notice')
    const first = await createCopyrightKeyNotice(firstKey)
    const second = await createCopyrightKeyNotice(secondKey)
    const owners = [first, second].map(fixture => ({
      kind: 'notice' as const,
      id: fixture.noticeId,
    }))
    provider.refuseKeyRead(second.keyId)
    await withCopyrightBatchTransactions(async query => {
      await expect(openCopyrightOwnerSecretBatch(owners, query, 'read')).rejects.toThrow(
        'Missing authoritative',
      )
      for (const fixture of [first, second])
        await expect(readCopyrightKeyReservation(fixture.keyId)).resolves.toMatchObject({
          destroyed_at: null,
        })
      provider.allowKeyRead(second.keyId)
      await using recovered = await openCopyrightOwnerSecretBatch(owners, query, 'read')
      for (const fixture of [first, second])
        expect(
          recovered
            .get({ kind: 'notice', id: fixture.noticeId })
            .decryptSecret(fixture.ciphertext, fixture.purpose),
        ).toBe('Synthetic claimant contact')
    })
  })

  it('does not attach a prepared notice key to an intake or resolve a nonexistent subject', async () => {
    await using prepared = await prepareCopyrightEncryptionKey('notice')
    const fixture = await createCopyrightKeyNotice(prepared)
    await withCopyrightBatchTransactions(async query => {
      await expect(
        prepared.attach({ kind: 'intake', id: crypto.randomUUID() }, query),
      ).rejects.toThrow('cannot attach to this owner')
      await expect(
        openCopyrightSecrets({ kind: 'submission', id: crypto.randomUUID() }, query),
      ).rejects.toThrow('has no live owner')
    })
    await using secrets = await openCopyrightSecrets({ kind: 'notice', id: fixture.noticeId })
    expect(secrets.decryptSecret(fixture.ciphertext, fixture.purpose)).toBe(
      'Synthetic claimant contact',
    )
  })
})
