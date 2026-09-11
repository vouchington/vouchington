import { describe, expect, it } from 'vitest'
import { TOPIC_ALIAS_ORDERING } from '../config.mts'
import { scheduledJobManifest, upsertSchedules } from './schedules.mts'

describe('topic alias schedules', () => {
  it('registers the durable category-mapping recovery scheduler', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })

  it('serializes category-mapping recovery jobs globally', () => {
    expect(scheduledJobManifest.jobs[0]?.template.opts).toMatchObject({
      ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
    })
  })
})
