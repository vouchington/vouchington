import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { countDynamicConfigAuditRows } from '@voucha/test-helpers/sql-dynamic-config'
import { updateDynamicConfigNamespace } from './service.mts'

describe('admin tag configuration ceilings', () => {
  it('rejects every over-ceiling topic budget without recording a config change', async () => {
    const administrator = await createTestUser({ administrator: true })
    for (const field of [
      'post_free_max_topics',
      'post_plus_max_topics',
      'post_pro_max_topics',
      'rss_discoverable_llm_max_topics',
      'rss_collaborative_plus_max_topics',
      'rss_collaborative_pro_max_topics',
    ]) {
      await expect(
        updateDynamicConfigNamespace(administrator, 'autotagger-paid-limits', { [field]: 21 }),
      ).rejects.toThrow(`Field ${field} must be less than or equal to 20`)
    }
    for (const field of ['just_joined', 'free', 'plus', 'pro']) {
      await expect(
        updateDynamicConfigNamespace(administrator, 'manual-tag-limits', { [field]: 21 }),
      ).rejects.toThrow(`Field ${field} must be less than or equal to 20`)
    }
    expect(await countDynamicConfigAuditRows('autotagger-paid-limits', administrator.id)).toBe(0)
    expect(await countDynamicConfigAuditRows('manual-tag-limits', administrator.id)).toBe(0)
  })
})
