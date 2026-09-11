import { describe, expect, it } from 'vitest'
import { MODERATOR_ACTION_TYPES as SHARED_MODERATOR_ACTION_TYPES } from '@ts-shared/utils/moderation-catalogs'
import { MODERATOR_ACTION_TYPES } from './config.mts'

describe('moderator actions config', () => {
  it('re-exports shared moderation catalogs', () => {
    expect(MODERATOR_ACTION_TYPES).toBe(SHARED_MODERATOR_ACTION_TYPES)
  })
})
