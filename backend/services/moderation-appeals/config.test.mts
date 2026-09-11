import { describe, expect, it } from 'vitest'
import {
  MODERATION_APPEAL_ACTIONS as SHARED_MODERATION_APPEAL_ACTIONS,
  MODERATION_APPEAL_STATUSES as SHARED_MODERATION_APPEAL_STATUSES,
} from '@ts-shared/utils/moderation-catalogs'
import { MODERATION_APPEAL_ACTIONS, MODERATION_APPEAL_STATUSES } from './config.mts'

describe('moderation appeals config', () => {
  it('re-exports shared moderation catalogs', () => {
    expect(MODERATION_APPEAL_STATUSES).toBe(SHARED_MODERATION_APPEAL_STATUSES)
    expect(MODERATION_APPEAL_ACTIONS).toBe(SHARED_MODERATION_APPEAL_ACTIONS)
  })
})
