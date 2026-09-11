import { describe, expect, it } from 'vitest'
import {
  MODERATION_REPORT_RESOLUTION_STATUSES as SHARED_MODERATION_REPORT_RESOLUTION_STATUSES,
  MODERATION_REPORT_STATUSES as SHARED_MODERATION_REPORT_STATUSES,
} from '@ts-shared/utils/moderation-catalogs'
import { MODERATION_REPORT_RESOLUTION_STATUSES, MODERATION_REPORT_STATUSES } from './config.mts'

describe('moderation reports config', () => {
  it('re-exports shared moderation catalogs', () => {
    expect(MODERATION_REPORT_STATUSES).toBe(SHARED_MODERATION_REPORT_STATUSES)
    expect(MODERATION_REPORT_RESOLUTION_STATUSES).toBe(SHARED_MODERATION_REPORT_RESOLUTION_STATUSES)
  })
})
