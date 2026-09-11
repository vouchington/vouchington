import { isActiveDataRequest } from './derive-status.mts'
import type { UserDataRequest } from './types.mts'
import { createDataRequest } from './create.mts'
import { getLatestDataRequest } from './get.mts'

type PostgresError = {
  code?: string
  constraint?: string
}

type CreateDataRequestOrConflictResult =
  | { type: 'created'; request: UserDataRequest }
  | { type: 'conflict'; existing: UserDataRequest | null }

type CreateDataRequestOrConflictDeps = {
  createDataRequest: typeof createDataRequest
  getLatestDataRequest: typeof getLatestDataRequest
}

const defaultDeps: CreateDataRequestOrConflictDeps = {
  createDataRequest,
  getLatestDataRequest,
}

export async function createDataRequestOrConflict(
  userId: string,
  deps: CreateDataRequestOrConflictDeps = defaultDeps,
): Promise<CreateDataRequestOrConflictResult> {
  const existing = await deps.getLatestDataRequest(userId)
  if (existing && isActiveDataRequest(existing)) {
    return { type: 'conflict', existing }
  }

  try {
    const request = await deps.createDataRequest(userId)
    return { type: 'created', request }
  } catch (error) {
    if (isActiveRequestUniqueViolation(error)) {
      // Intentional extra read after the write race so API callers can return the
      // current active request metadata in a 409 response.
      const racedExisting = await deps.getLatestDataRequest(userId)
      return {
        type: 'conflict',
        existing: racedExisting && isActiveDataRequest(racedExisting) ? racedExisting : null,
      }
    }
    throw error
  }
}

function isActiveRequestUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const pgError = error as PostgresError
  return (
    pgError.code === '23505' && pgError.constraint === 'idx_user_data_requests__active_per_user'
  )
}
