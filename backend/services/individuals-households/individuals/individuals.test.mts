import { describe, expect, it } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from '@voucha/test-helpers'
import { getOrCreateIndividual } from './individuals.mts'

describe('getOrCreateIndividual', () => {
  it('creates a replacement when the automatic individual row is gone', async () => {
    const user = await createTestUser()
    expect(user.individual_id).toBeTruthy()
    await write(sql`DELETE FROM individuals WHERE id = ${user.individual_id}`)

    const created = await getOrCreateIndividual(user)
    expect(created?.id).toEqual(expect.any(String))
    expect(created?.id).not.toBe(user.individual_id)
  })
})
