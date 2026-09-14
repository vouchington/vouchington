import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestRewardsProgram } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { MAX_POINT_VALUE_MICROUNITS } from '@ts-shared/money'

const collectionPath = '/api/v1/my/rewards-program-point-valuations'

describe('rewards program point valuation REST boundaries', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('accepts the maximum point value on POST and rejects the next microunit', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const maximumProgramId = await insertTestRewardsProgram({ createdById: user.id })
    const maximum = await request
      .post(collectionPath)
      .send({
        rewards_program_id: maximumProgramId,
        value_per_point: pointValue(MAX_POINT_VALUE_MICROUNITS),
      })
      .expect(201)
    expect(maximum.body.point_valuation.value_per_point.amount).toBe(MAX_POINT_VALUE_MICROUNITS)

    const excessiveProgramId = await insertTestRewardsProgram({ createdById: user.id })
    await request
      .post(collectionPath)
      .send({
        rewards_program_id: excessiveProgramId,
        value_per_point: pointValue(MAX_POINT_VALUE_MICROUNITS + 1),
      })
      .expect(422)
  })

  it('preserves the accepted maximum after PATCH rejects the next microunit', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const created = await request
      .post(collectionPath)
      .send({
        rewards_program_id: programId,
        value_per_point: pointValue(10_000),
      })
      .expect(201)
    const valuationPath = `${collectionPath}/${created.body.point_valuation.id}`

    const maximum = await request
      .patch(valuationPath)
      .send({ value_per_point: pointValue(MAX_POINT_VALUE_MICROUNITS) })
      .expect(200)
    expect(maximum.body.point_valuation.value_per_point.amount).toBe(MAX_POINT_VALUE_MICROUNITS)

    await request
      .patch(valuationPath)
      .send({ value_per_point: pointValue(MAX_POINT_VALUE_MICROUNITS + 1) })
      .expect(422)

    const list = await request.get(`${collectionPath}?limit=100`).expect(200)
    const unchanged = list.body.results.find(
      (valuation: { id: string }) => valuation.id === created.body.point_valuation.id,
    )
    expect(unchanged?.value_per_point.amount).toBe(MAX_POINT_VALUE_MICROUNITS)
  })
})

function pointValue(amount: number) {
  return { amount, currency: 'usd', scale: 6 }
}
