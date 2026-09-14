import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { setPostClearanceStatus } from './set-status.mts'

describe('setPostClearanceStatus', () => {
  it('rejects a platform override without a stable public reason code', async () => {
    await expect(
      setPostClearanceStatus(
        randomUUID(),
        'approved',
        undefined,
        undefined,
        {},
        {
          platformOverride: true,
        },
      ),
    ).rejects.toThrow('Platform clearance overrides require a reason code')
  })

  it('rejects a private note unless the decision is a platform override', async () => {
    await expect(
      setPostClearanceStatus(
        randomUUID(),
        'approved',
        undefined,
        undefined,
        {},
        {
          privateNote: 'Internal review note',
        },
      ),
    ).rejects.toThrow('Private clearance notes are only allowed on platform overrides')
  })
})
