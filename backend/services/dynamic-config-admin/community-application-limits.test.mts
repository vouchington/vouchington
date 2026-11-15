import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { updateDynamicConfigNamespace } from './service.mts'

describe('community application limit administration', () => {
  it('rejects a question cap above 1000 before writing configuration', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    await expect(
      updateDynamicConfigNamespace(developer, 'community-application-limits-config', {
        questions_per_community: 1001,
      }),
    ).rejects.toThrow(/1000/)
  })

  it('rejects an option cap above its maximum', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    await expect(
      updateDynamicConfigNamespace(developer, 'community-application-limits-config', {
        options_per_question: 1001,
      }),
    ).rejects.toThrow(/1000/)
  })
})
