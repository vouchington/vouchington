import { describe, expect, it } from 'vitest'
import { createDueStatutoryCopyrightRestoreIntents } from './statutory-restoration-schedule.mts'

describe('createDueStatutoryCopyrightRestoreIntents', () => {
  it('materializes no restore intents when no due deadlines exist', async () => {
    await expect(createDueStatutoryCopyrightRestoreIntents(new Date())).resolves.toBe(0)
  })
})
