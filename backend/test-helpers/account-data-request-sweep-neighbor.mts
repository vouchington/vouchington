import { createTestUser } from './entities/users.mts'
import {
  makeUserDataRequestRecoverableForTest,
  expireUserDataRequestForTest,
  orphanTestDataRequest,
} from './entities/account-data-requests.mts'
import { createDataRequest } from '../services/account-data-requests/create.mts'
import { getDataRequestById } from '../services/account-data-requests/get.mts'
import {
  markDataRequestProcessing,
  markDataRequestReady,
} from '../services/account-data-requests/update.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** An equally eligible row excluded from the caller's owned-ID sweep. */
export async function createTestDataRequestSweepNeighbor(
  mode: 'unstarted' | 'stale' | 'expired' | 'orphan' = 'unstarted',
) {
  const user = await createTestUser()
  const request = await createDataRequest(user.id, user.id)
  if (mode === 'expired') {
    await markDataRequestProcessing(request.id, request.processing_attempt_id)
    await markDataRequestReady(request.id, `test/${request.id}.zip`, new Date(Date.now() + 60_000))
    await expireUserDataRequestForTest(request.id)
  } else if (mode === 'orphan') {
    await orphanTestDataRequest(request.id)
  } else {
    await makeUserDataRequestRecoverableForTest(request.id, mode)
  }
  const state = await readState()
  if (!state) throw new Error('Expected the eligible sweep neighbor to exist')
  return { request, state, readState }

  async function readState() {
    if (mode !== 'orphan') return getDataRequestById(user.id, user.id, request.id)
    const { rows } = await read(sql`/* readTestOrphanDataRequestNeighbor */
      SELECT failed_at, last_error_message, updated_at FROM user_data_requests WHERE id = ${request.id}`)
    return rows[0]
  }
}
