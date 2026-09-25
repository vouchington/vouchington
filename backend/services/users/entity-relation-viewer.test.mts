import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { entityRelationViewerFor } from './entity-relation-viewer.mts'

type UserOptions = NonNullable<Parameters<typeof createTestUser>[0]>

describe('entityRelationViewerFor', () => {
  it('describes signed-out requests as anonymous', () => {
    expect(entityRelationViewerFor(null)).toEqual({ kind: 'anonymous' })
  })

  it.each<[UserOptions, 'administrator' | 'moderator' | null]>([
    [{ administrator: true, extraRoles: ['moderator'] }, 'administrator'],
    [{ extraRoles: ['moderator'] }, 'moderator'],
    [{}, null],
  ])('maps %j to staff role %s', async (options, staffRole) => {
    const user = await createTestUser(options)
    expect(entityRelationViewerFor(user)).toEqual({ kind: 'user', userId: user.id, staffRole })
  })
})
