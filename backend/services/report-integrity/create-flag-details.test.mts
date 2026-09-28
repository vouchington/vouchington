import { describe, expect, it } from 'vitest'
import { createReportIntegrityFlag } from './create-flag.mts'

describe('report integrity detail guards', () => {
  it('rejects a reporter list or numeric detail before inserting', async () => {
    const entityId = '00000000-0000-7000-8000-000000000001'
    await expect(
      createReportIntegrityFlag('post', entityId, 2, 0.5, { reporter_user_ids: 'user' }),
    ).rejects.toThrow('reporter list')
    await expect(
      createReportIntegrityFlag('post', entityId, 2, 0.5, { threshold: 'high' }),
    ).rejects.toThrow('threshold')
  })
})
