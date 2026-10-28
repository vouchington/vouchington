import { getTestPrivateUserById } from '../../backend/test-helpers/entities/users.mts'
import { settleTopicMergeOperationForTest } from '../../backend/test-helpers/merge-topics.mts'
import { TEST_USER_ID } from '../../integration-tests/web/helpers/constants.mts'

/** Settle only the operation admitted by this browser, through real committed service pages. */
export async function completeTopicMerge(
  sourceTopicId: string,
  operationId: string,
): Promise<void> {
  const administrator = await getTestPrivateUserById(TEST_USER_ID)
  if (!administrator) throw new Error('Playwright administrator fixture is missing')
  await settleTopicMergeOperationForTest(administrator, sourceTopicId, operationId)
}
