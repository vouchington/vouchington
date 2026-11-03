import { afterAll, describe, expect, it } from 'vitest'
import {
  deleteComplaintRecorder,
  deleteGuardedFactRows,
} from '../../../test-helpers/data-stores/psql/copyright-terminal-fact-guards.mts'
import { onGracefulShutdown } from '../index.mts'

describe('copyright terminal legal fact guards', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it.each([false, true])(
    'lets account deletion null only the recorder of a complaint (resolved: %s)',
    async resolved => {
      const { before, after } = await deleteComplaintRecorder(resolved)
      expect(before.recorderId).toEqual(expect.any(String))
      expect(after.recorderId).toBeNull()
      expect(after.otherFields).toEqual(before.otherFields)
    },
  )

  it('rejects an ordinary delete of an open hold, an escalation and a complaint', async () => {
    await expect(deleteGuardedFactRows()).resolves.toEqual({
      hold: '23514',
      escalation: '23514',
      complaint: '23514',
    })
  })
})
