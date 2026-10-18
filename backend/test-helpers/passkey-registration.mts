import { randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import type { createPasskey } from '../services/passkeys/create.mts'
import { createVoteWeightDispatchUserAt } from './vote-weight-dispatch.mts'

export async function createTestPasskeyVoteWeightDirtyUser(at: Date) {
  return {
    userId: await createVoteWeightDispatchUserAt(at),
    afterId: v7({ msecs: at.getTime() - 1 }),
  }
}

export function createTestVerifiedPasskeyRegistration(): Parameters<typeof createPasskey>[1] {
  return {
    fmt: 'none',
    aaguid: '00000000-0000-0000-0000-000000000000',
    credential: {
      id: `test-passkey-${randomUUID()}`,
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
    },
    credentialType: 'public-key',
    attestationObject: new Uint8Array([1]),
    userVerified: true,
    credentialDeviceType: 'singleDevice',
    credentialBackedUp: false,
    origin: 'https://example.com',
  }
}
