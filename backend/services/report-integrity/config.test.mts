import { describe, expect, it } from 'vitest'
import { INTEGRITY_FLAG_STATUSES as SHARED_INTEGRITY_FLAG_STATUSES } from '@ts-shared/utils/moderation-catalogs'
import { INTEGRITY_FLAG_STATUSES } from './config.mts'

describe('report integrity config', () => {
  it('re-exports shared moderation catalogs', () => {
    expect(INTEGRITY_FLAG_STATUSES).toBe(SHARED_INTEGRITY_FLAG_STATUSES)
  })
})
