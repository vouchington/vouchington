import { randomUUID } from 'node:crypto'
import sql, { type SQLStatement } from 'sql-template-strings'
import { afterAll, describe, expect, it } from 'vitest'
import { createTestUser } from '../../../test-helpers/entities/users.mts'
import { beginTransaction, onGracefulShutdown } from '../index.mts'

async function insertHold(accountId: string, placedById: string, ciphertext = 'cipher') {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(sql`/* insertTestPreservationHold */
    INSERT INTO user_legal_preservation_holds (account_user_id, placed_by_id, reference_ciphertext)
    VALUES (${accountId}, ${placedById}, ${ciphertext}) RETURNING id`)
  await query.commit()
  return rows[0]!.id
}

async function run(statement: SQLStatement) {
  await using query = await beginTransaction()
  await query(statement)
  await query.commit()
}

describe('user_legal_preservation_holds schema', () => {
  afterAll(onGracefulShutdown)

  it('allows one open hold per account and a new hold after release', async () => {
    const [admin, account] = await Promise.all([createTestUser(), createTestUser()])
    const holdId = await insertHold(account.id, admin.id)

    await expect(insertHold(account.id, admin.id)).rejects.toMatchObject({ code: '23505' })
    await run(sql`UPDATE user_legal_preservation_holds
      SET released_at = CURRENT_TIMESTAMP, released_by_id = ${admin.id} WHERE id = ${holdId}`)

    await expect(insertHold(account.id, admin.id)).resolves.toEqual(expect.any(String))
  })

  it('never deletes a hold and freezes everything except one release', async () => {
    const [admin, account] = await Promise.all([createTestUser(), createTestUser()])
    const holdId = await insertHold(account.id, admin.id)

    await expect(
      run(sql`DELETE FROM user_legal_preservation_holds WHERE id = ${holdId}`),
    ).rejects.toThrow('legal preservation holds are retained')
    await expect(
      run(sql`UPDATE user_legal_preservation_holds
        SET reference_ciphertext = 'other' WHERE id = ${holdId}`),
    ).rejects.toThrow('legal preservation holds change only by a single release')
    await run(sql`UPDATE user_legal_preservation_holds
      SET released_at = CURRENT_TIMESTAMP, released_by_id = ${admin.id} WHERE id = ${holdId}`)
    await expect(
      run(sql`UPDATE user_legal_preservation_holds
        SET released_at = NULL, released_by_id = NULL WHERE id = ${holdId}`),
    ).rejects.toThrow('legal preservation holds change only by a single release')
    await expect(
      run(sql`DELETE FROM user_legal_preservation_holds WHERE id = ${holdId}`),
    ).rejects.toThrow('legal preservation holds are retained')
  })

  it('requires released_at and released_by_id together and a non-empty reference', async () => {
    const [admin, account] = await Promise.all([createTestUser(), createTestUser()])
    const holdId = await insertHold(account.id, admin.id)

    await expect(
      run(sql`UPDATE user_legal_preservation_holds
        SET released_at = CURRENT_TIMESTAMP WHERE id = ${holdId}`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(insertHold(account.id, admin.id, '')).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects a hold that names an unknown account or administrator', async () => {
    const admin = await createTestUser()

    await expect(insertHold(randomUUID(), admin.id)).rejects.toMatchObject({ code: '23503' })
    await expect(insertHold(admin.id, randomUUID())).rejects.toMatchObject({ code: '23503' })
  })
})
