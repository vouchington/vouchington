import {
  getPendingCopyrightAgentDispatches,
  type CopyrightAgentDispatch,
} from '../../../services/copyright-notices/reconcile-agent-dispatches.mts'
import { encodeUuidCursorBefore } from '../../modules/pagination/uuid-cursors.mts'

/**
 * Pending dispatches for one owned email intake or submission, read through the production keyset
 * page that starts at that ID instead of the shared database's global head. The owned dispatch, when
 * pending, is always the page's first row, so an empty result proves it is not pending.
 */
export async function readTestPendingCopyrightAgentDispatches(
  id: string,
): Promise<CopyrightAgentDispatch[]> {
  const { results } = await getPendingCopyrightAgentDispatches({
    after: encodeUuidCursorBefore(id),
    limit: 1,
  })
  return results.filter(
    dispatch => (dispatch.kind === 'email' ? dispatch.intakeId : dispatch.submissionId) === id,
  )
}
