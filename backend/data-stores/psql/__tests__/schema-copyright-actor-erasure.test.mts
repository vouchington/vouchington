import { afterAll, describe, expect, it } from 'vitest'
import { eraseCopyrightActorAndReadAuditLinks } from '../../../test-helpers/data-stores/psql/copyright-actor-erasure.mts'
import { onGracefulShutdown } from '../index.mts'

describe('copyright actor erasure', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('nulls user links without erasing immutable legal decisions', async () => {
    await expect(eraseCopyrightActorAndReadAuditLinks()).resolves.toEqual({
      assessedById: null,
      draftedById: null,
      actorUserId: null,
    })
  })
})
