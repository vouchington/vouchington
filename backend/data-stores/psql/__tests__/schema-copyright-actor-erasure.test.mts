import { afterAll, describe, expect, it } from 'vitest'
import { eraseCopyrightActorAndReadAuditLinks } from '../../../test-helpers/data-stores/psql/copyright-actor-erasure.mts'
import { onGracefulShutdown } from '../index.mts'

describe('copyright actor erasure', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('erases live-user links and retains the lifecycle actor without erasing legal decisions', async () => {
    await expect(eraseCopyrightActorAndReadAuditLinks()).resolves.toEqual({
      assessedById: null,
      draftedById: null,
      actorUserId: expect.any(String),
      recipientUserId: null,
      recipientUserErasedAt: expect.any(Date),
    })
  })
})
