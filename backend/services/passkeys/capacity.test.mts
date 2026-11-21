import { describe, expect, it, onTestFinished } from 'vitest'
import { randomUUID } from 'node:crypto'
import { runInsideTestWorkerProcessor } from '@vouchington/worker-runtime/testing'
import { createTestUser, insertTestPasskey, countTestPasskeys } from '@voucha/test-helpers'
import { createTestVerifiedPasskeyRegistration } from '@voucha/test-helpers/passkey-registration'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { userProductLimitsConfig } from '@services/user-product-limits'
import { createPasskey } from './create.mts'
import { getPasskeyCredentialIdsByUserId } from './get.mts'

describe('passkey capacity', () => {
  it('rejects the eleventh credential without changing the ten usable sign-in credentials', async () => {
    const user = await createTestUser()
    for (let index = 0; index < 9; index++) {
      await insertTestPasskey(user.id, randomUUID())
    }
    const tenth = await runInsideTestWorkerProcessor(() =>
      createPasskey(user.id, createTestVerifiedPasskeyRegistration(), 'Tenth'),
    )
    expect(tenth.name).toBe('Tenth')
    const before = await getPasskeyCredentialIdsByUserId(user.id)
    await expect(
      createPasskey(user.id, createTestVerifiedPasskeyRegistration(), 'Excess'),
    ).rejects.toMatchObject({ status: 400, code: 'PASSKEY_LIMIT_REACHED' })
    expect(await countTestPasskeys(user.id)).toBe(10)
    expect(await getPasskeyCredentialIdsByUserId(user.id)).toEqual(expect.arrayContaining(before))
  })

  it('rejects a credential above the configured cap and still lists every stored credential', async () => {
    const user = await createTestUser()
    for (let index = 0; index < 3; index++) {
      await insertTestPasskey(user.id, randomUUID())
    }
    onTestFinished(overrideDynamicConfigFieldsForTest(userProductLimitsConfig, { passkeys_max: 3 }))
    await expect(
      createPasskey(user.id, createTestVerifiedPasskeyRegistration(), 'Excess'),
    ).rejects.toMatchObject({ status: 400, code: 'PASSKEY_LIMIT_REACHED' })
    expect(await countTestPasskeys(user.id)).toBe(3)

    for (let index = 0; index < 2; index++) {
      await insertTestPasskey(user.id, randomUUID())
    }
    expect(await getPasskeyCredentialIdsByUserId(user.id)).toHaveLength(5)
  })
})
