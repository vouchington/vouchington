import { createClassifierFixtureData } from './classifier-fixture-data.mts'
import { buildClassifierFixtureInspection } from './classifier-fixture-inspection.mts'
import { buildClassifierFixtureOperations } from './classifier-fixture-operations.mts'
import { buildClassifierThresholdFixtureOperations } from './classifier-threshold-fixture-operations.mts'

export async function createClassifierFixture() {
  const data = await createClassifierFixtureData()
  return {
    ...data,
    ...buildClassifierFixtureOperations(data),
    ...buildClassifierThresholdFixtureOperations(data),
    ...buildClassifierFixtureInspection(data),
  }
}
