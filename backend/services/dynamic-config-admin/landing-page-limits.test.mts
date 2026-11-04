import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { updateDynamicConfigNamespace } from './service.mts'

describe('landing-page limit administration', () => {
  it('rejects fractional caps before writing configuration', async () => {
    const admin = await createTestUser({ administrator: true })
    await expect(
      updateDynamicConfigNamespace(admin, 'landing-page-limits-config', { items_per_page: 1.5 }),
    ).rejects.toThrow(/integer/i)
  })

  it('keeps the product cap administrator-only', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    await expect(
      updateDynamicConfigNamespace(developer, 'landing-page-limits-config', { items_per_page: 2 }),
    ).resolves.toBeNull()
  })
})
