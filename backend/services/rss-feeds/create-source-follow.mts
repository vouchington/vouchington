import type { BasicUser } from '@services/users/types'
import { isRelationLimitError } from '@services/entity-relations/relation-limits'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import onError from '@modules/on-error'
import { followRssFeedRelation } from './create-source-helpers.mts'

export async function followSource(currentUser: BasicUser, feedId: string): Promise<boolean> {
  try {
    await upsertEntityRelation(currentUser, followRssFeedRelation, { id: currentUser.id }, [
      { id: feedId },
    ])
    return false
  } catch (err) {
    if (isRelationLimitError(err)) return true
    onError(err instanceof Error ? err : new Error(String(err)))
    return false
  }
}
