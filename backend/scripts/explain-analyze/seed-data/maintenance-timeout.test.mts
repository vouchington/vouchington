import { observeSeedMaintenanceTimeout } from '@voucha/test-helpers/seed-maintenance-timeout'
import { describe, expect, it } from 'vitest'

describe('seed maintenance connection budget', () => {
  it('restores the borrowed session budget after standalone VACUUM', async () => {
    await expect(observeSeedMaintenanceTimeout(false)).resolves.toEqual({
      during: '3min',
      after: '1234ms',
      failed: false,
    })
  })

  it('restores the borrowed session budget after a PostgreSQL statement fails', async () => {
    await expect(observeSeedMaintenanceTimeout(true)).resolves.toEqual({
      during: '3min',
      after: '1234ms',
      failed: true,
    })
  })
})
