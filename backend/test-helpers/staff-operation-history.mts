import { expect } from 'vitest'
import { readStaffActionHistory } from './staff-action-history.mts'

export async function expectStaffOperationHistory(actorId: string, actionType: string) {
  const rows = (await readStaffActionHistory(actorId)).filter(row => row.action_type === actionType)
  const outcome = rows.at(-1)
  const request = rows.at(-2)
  expect(request?.metadata.phase).toBe('requested')
  expect(outcome?.metadata).toMatchObject({ phase: 'finished', outcome: 'succeeded' })
  expect(outcome?.operation_request_id).toBeDefined()
  expect(outcome?.operation_request_id).toBe(request?.id)
}
