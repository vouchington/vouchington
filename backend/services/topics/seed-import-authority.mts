import { AsyncLocalStorage } from 'node:async_hooks'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'

const seedActor = new AsyncLocalStorage<{ id: string; isActive: () => boolean }>()

/** Internal bootstrap authority; never entered by administrative request or queue handlers. */
export async function runSystemTopicSeedImport<T>(
  actor: PrivateUser,
  callback: () => Promise<T>,
): Promise<T> {
  assert(
    actor.account_type === 'system' && actor.roles.length === 0,
    403,
    'Seed actor must be a role-free system account',
  )
  let active = true
  const scope = { id: actor.id, isActive: () => active }
  return seedActor.run(scope, async () => {
    try {
      return await callback()
    } finally {
      // Detached async children retain the context, but cannot retain completed seed authority.
      active = false
    }
  })
}

export function isSystemTopicSeedActor(actor: PrivateUser): boolean {
  const scope = seedActor.getStore()
  return (
    scope?.isActive() === true &&
    scope.id === actor.id &&
    actor.account_type === 'system' &&
    actor.roles.length === 0
  )
}
