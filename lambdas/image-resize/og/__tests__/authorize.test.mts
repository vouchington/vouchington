import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { getImagePlacementDeliveryKey, type PlacementSourcePolicy } from '@ts-shared/url-signing'
import {
  createOwnedDynamoDbTable,
  putDynamoDbItem,
} from '../../../../backend/test-helpers/aws-emulator-owned-dynamodb-table.mts'
import { authorizeOgDependencies } from '../authorize.mts'

let table: string

// Each dependency is its own placement, so seeded states never collide inside the file's table.
function newDependency(): PlacementSourcePolicy {
  return { placementId: randomUUID(), revision: 2, imageId: randomUUID() }
}

async function seedState(dependency: PlacementSourcePolicy, state: string) {
  await putDynamoDbItem(table, {
    delivery_key: { S: getImagePlacementDeliveryKey(dependency) },
    state: { S: state },
  })
}

const env = () => ({
  MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: 'enforce',
  MEDIA_DELIVERY_REGISTRY_TABLE: table,
  MEDIA_DELIVERY_REGISTRY_REGION: 'us-west-2',
})
// A table that was never created: every read against it fails in the emulator.
const missingTableEnv = () => ({
  ...env(),
  MEDIA_DELIVERY_REGISTRY_TABLE: `missing-${randomUUID()}`,
})

describe('OG registry authorization', () => {
  // no-mistakes-timeout-reason: the emulator takes about three seconds to make a table ACTIVE
  beforeAll(async () => {
    table = await createOwnedDynamoDbTable('og-registry', 'delivery_key')
  }, 30_000)

  it('reads the shared placement key written by the registry', async () => {
    const dependency = newDependency()
    await seedState(dependency, 'allow')
    await expect(authorizeOgDependencies([dependency], env())).resolves.toEqual({
      states: ['allow'],
      cacheable: true,
    })
  })

  it('maps allowed, withheld, missing and unexpected records', async () => {
    const [allowed, withheld, missing, unexpected] = [
      newDependency(),
      newDependency(),
      newDependency(),
      newDependency(),
    ]
    await seedState(allowed!, 'allow')
    await seedState(withheld!, 'withheld')
    await seedState(unexpected!, 'pending')
    await expect(
      authorizeOgDependencies([allowed!, withheld!, missing!, unexpected!], env()),
    ).resolves.toEqual({
      states: ['allow', 'withheld', 'unknown', 'unknown'],
      cacheable: true,
    })
  })

  it('drops every dependency and disables caching when a read fails', async () => {
    await expect(
      authorizeOgDependencies([newDependency(), newDependency()], missingTableEnv()),
    ).resolves.toEqual({ states: ['unknown', 'unknown'], cacheable: false })
  })

  it('keeps empty and inactive cards cacheable without reading the registry', async () => {
    // A read of the missing table would fail and make the result uncacheable.
    await expect(authorizeOgDependencies([], {})).resolves.toEqual({ states: [], cacheable: true })
    for (const mode of ['off', 'report']) {
      await expect(
        authorizeOgDependencies([newDependency()], {
          ...missingTableEnv(),
          MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: mode,
        }),
      ).resolves.toEqual({ states: ['unknown'], cacheable: true })
    }
  })

  it('disables caching for missing configuration and never reads over four tuples', async () => {
    await expect(
      authorizeOgDependencies([newDependency()], {
        MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: 'enforce',
      }),
    ).resolves.toEqual({ states: ['unknown'], cacheable: false })
    // Five seeded 'allow' records would read back as 'allow' if the fifth tuple were read.
    const five = Array.from({ length: 5 }, newDependency)
    for (const dependency of five) await seedState(dependency, 'allow')
    await expect(authorizeOgDependencies(five, env())).resolves.toEqual({
      states: Array(5).fill('unknown'),
      cacheable: false,
    })
    await expect(authorizeOgDependencies(five.slice(0, 4), env())).resolves.toEqual({
      states: Array(4).fill('allow'),
      cacheable: true,
    })
  })
})
