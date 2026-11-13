import { expect } from 'vitest'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
} from '../services/images/placements.mts'
import { mutateCopyrightPlacement } from '../services/copyright-notices/action-delivery-mutation.mts'
import { claimActionDeliveryFixture } from './copyright-action-delivery-contract-fixtures.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  terminalDeliveryState,
  type DeliveryContractOwner,
} from './copyright-action-delivery-contract-state.mts'

/** Exercises the real conditional placement write after its cached tuple has changed. */
export async function assertActionDeliveryMutation(
  input: DeliveryContractOwner & {
    intentId: string
    now: Date
    change: 'stale' | 'deleted'
  },
) {
  const before = await readDeliveryContractState(input)
  await using query = await beginTransaction()
  const legal = await claimActionDeliveryFixture(input.intentId, query)
  const current = await getImagePlacementForCopyright(input.placementId, { query })
  if (!current) throw new Error('Owned mutation placement disappeared')
  let changed = false
  const intercepted = new Proxy(query, {
    async apply(target, thisArgument, args: Parameters<QueryExecutor>) {
      const [statement] = args
      const text = typeof statement === 'string' ? statement : statement.text
      if (!changed && text.includes('/* changeImagePlacementsCopyrightWithholding */')) {
        changed = true
        if (input.change === 'deleted')
          await target(sql`/* actionMutationSubject:retire */
            UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP, retirement_reason = 'owner_removed',
              revision = revision + 1 WHERE id = ${input.placementId}`)
        else {
          await expect(
            withholdImagePlacementForCopyright(
              {
                placementId: input.placementId,
                expectedRevision: current.revision,
              },
              { query: target },
            ),
          ).resolves.toMatchObject({ status: 'applied' })
          await expect(
            restoreImagePlacementForCopyright(
              {
                placementId: input.placementId,
                expectedRevision: current.revision + 1,
              },
              { query: target },
            ),
          ).resolves.toMatchObject({ status: 'applied' })
        }
      }
      return Reflect.apply(target, thisArgument, args)
    },
  })
  const result = await mutateCopyrightPlacement({
    intentId: input.intentId,
    legal,
    current,
    now: input.now,
    query: intercepted,
  })
  expect(changed).toBe(true)
  expect(result).toEqual({ terminal: 'stale' })
  await query.commit()
  const terminal = terminalDeliveryState(
    claimedDeliveryState(before, input.intentId),
    input.intentId,
    'stale',
    `Placement transition was ${input.change}.`,
  )
  expect(await readDeliveryContractState(input)).toEqual({
    ...terminal,
    physical: {
      withheld: false,
      revision: before.physical.revision + (input.change === 'stale' ? 2 : 1),
    },
    placementDeleted: input.change === 'deleted',
  })
}
