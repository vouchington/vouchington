import { describe, expect, it } from 'vitest'
import { planCopyrightRetentionPages } from './retention-erasure-budget.mts'

describe('copyright retention page allocation', () => {
  it('rotates a one-page budget across every enabled work family', async () => {
    const plans = []
    for (let page = 0; page < 3; page++) plans.push(await planCopyrightRetentionPages(1, 10, true))
    for (const plan of plans) expect(Number(plan.keys) + Number(plan.objects) + plan.cases).toBe(1)
    expect(plans).toEqual(
      expect.arrayContaining([
        { keys: true, objects: false, cases: 0 },
        { keys: false, objects: true, cases: 0 },
        { keys: false, objects: false, cases: 1 },
      ]),
    )
  })

  it('shares two pages without starving maintenance when case deletion is disabled', async () => {
    const first = await planCopyrightRetentionPages(1, 1, false)
    const second = await planCopyrightRetentionPages(1, 1, false)
    expect([first, second]).toEqual(
      expect.arrayContaining([
        { keys: true, objects: false, cases: 0 },
        { keys: false, objects: true, cases: 0 },
      ]),
    )
    await expect(planCopyrightRetentionPages(2, 1, false)).resolves.toEqual({
      keys: true,
      objects: true,
      cases: 0,
    })
  })

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid page budget %s before changing work allocation',
    async budget => {
      await expect(planCopyrightRetentionPages(budget, 1, true)).rejects.toThrow(
        'Invalid copyright retention work page budget',
      )
    },
  )
})
