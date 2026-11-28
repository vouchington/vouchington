import { deleteForeignKeyTargetDuringInsertForTest } from './postgres-foreign-key-race.mts'

export function deleteUserListDuringInsertForTest<Result>(
  listId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker: '/* addListItem */',
    lockTarget: async query => {
      await query('/* lockTestUserList */ SELECT id FROM user_lists WHERE id = $1 FOR UPDATE', [
        listId,
      ])
    },
    deleteTarget: async query => {
      await query('/* deleteTestUserList */ DELETE FROM user_lists WHERE id = $1', [listId])
    },
    operation,
  })
}

export function deleteCardTopicDuringInsertForTest<Result>(
  queryMarker: string,
  topicId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker,
    lockTarget: async query => {
      await query('/* lockTestCardTopic */ SELECT id FROM topics WHERE id = $1 FOR UPDATE', [
        topicId,
      ])
    },
    deleteTarget: async query => {
      await query('/* deleteTestCardTopic */ DELETE FROM topics WHERE id = $1', [topicId])
    },
    operation,
  })
}

export function deleteIndividualDuringInsertForTest<Result>(
  queryMarker: string,
  individualId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker,
    lockTarget: async query => {
      await query(
        '/* lockTestIndividualOwner */ SELECT id FROM individuals WHERE id = $1 FOR UPDATE',
        [individualId],
      )
    },
    deleteTarget: async query => {
      await query('/* deleteTestIndividualOwner */ DELETE FROM individuals WHERE id = $1', [
        individualId,
      ])
    },
    operation,
  })
}

export function deleteSpendingCategoryTopicDuringInsertForTest<Result>(
  queryMarker: string,
  categoryId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker,
    lockTarget: async query => {
      await query(
        '/* lockTestSpendingCategoryTopic */ SELECT topic_id FROM spending_category_topics WHERE topic_id = $1 FOR UPDATE',
        [categoryId],
      )
    },
    deleteTarget: async query => {
      await query(
        '/* deleteTestSpendingCategoryTopic */ DELETE FROM spending_category_topics WHERE topic_id = $1',
        [categoryId],
      )
    },
    operation,
  })
}

export function deleteRewardsProgramTopicDuringInsertForTest<Result>(
  queryMarker: string,
  programId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker,
    lockTarget: async query => {
      await query(
        '/* lockTestRewardsProgramTopic */ SELECT topic_id FROM rewards_program_topics WHERE topic_id = $1 FOR UPDATE',
        [programId],
      )
    },
    deleteTarget: async query => {
      await query(
        '/* deleteTestRewardsProgramTopic */ DELETE FROM rewards_program_topics WHERE topic_id = $1',
        [programId],
      )
    },
    operation,
  })
}

export function deleteRewardsProgramStatusTopicDuringInsertForTest<Result>(
  queryMarker: string,
  statusId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker,
    lockTarget: async query => {
      await query(
        '/* lockTestRewardsProgramStatusTopic */ SELECT topic_id FROM rewards_program_status_topics WHERE topic_id = $1 FOR UPDATE',
        [statusId],
      )
    },
    deleteTarget: async query => {
      await query(
        '/* deleteTestRewardsProgramStatusTopic */ DELETE FROM rewards_program_status_topics WHERE topic_id = $1',
        [statusId],
      )
    },
    operation,
  })
}

export function deleteReferralProgramTopicDuringInsertForTest<Result>(
  queryMarker: string,
  referralProgramId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker,
    lockTarget: async query => {
      await query(
        '/* lockTestReferralProgramTopic */ SELECT topic_id FROM referral_program_topics WHERE topic_id = $1 FOR UPDATE',
        [referralProgramId],
      )
    },
    deleteTarget: async query => {
      await query(
        '/* deleteTestReferralProgramTopic */ DELETE FROM referral_program_topics WHERE topic_id = $1',
        [referralProgramId],
      )
    },
    operation,
  })
}
