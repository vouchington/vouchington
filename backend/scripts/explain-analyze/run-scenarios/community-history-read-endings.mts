import assert from 'node:assert/strict'
import { buildPageInfo, encodeCursor } from '@modules/pagination'
import { listCommunityAgentPromptHistory } from '@services/community-agent-prompts/history'
import { getCommunitySavedReplies } from '@services/modmail/saved-replies'
import { searchModeratorActions } from '@services/moderator-actions'
import { listUserModNotes } from '@services/user-mod-notes/get'
import { seedUser } from '../run-support.mts'
import type { seedCommunityHistoryReads } from './community-history-reads-fixture.mts'

type Fixture = Awaited<ReturnType<typeof seedCommunityHistoryReads>>

export async function assertCommunityHistoryEndings(
  fixture: Fixture,
  pageSize: number,
  promptHistoryPageSize: number,
) {
  await Promise.all([
    assertSavedReplyEnding(fixture, pageSize),
    assertPromptHistoryEnding(fixture, promptHistoryPageSize),
    assertModeratorActionEnding(fixture, pageSize),
    assertUserModNoteEnding(fixture, pageSize),
  ])
}

async function assertSavedReplyEnding({ communityId, replies }: Fixture, pageSize: number) {
  const last = replies[2 * pageSize - 1]!
  const final = await getCommunitySavedReplies(communityId, {
    limit: pageSize,
    after: { ranking: last.order_index, id: last.id },
  })
  assert.deepEqual(
    final.map(row => row.id),
    replies.slice(2 * pageSize).map(row => row.id),
  )
  const pageInfo = buildPageInfo(final.slice(0, pageSize), {
    hasNextPage: final.length > pageSize,
    getCursor: reply => ({ ranking: reply.order_index, id: reply.id }),
  })
  assert.equal(pageInfo.has_next_page, false)
  assert.equal(pageInfo.end_cursor, null)
}

async function assertPromptHistoryEnding(
  { communityId, revisionIds }: Fixture,
  promptHistoryPageSize: number,
) {
  // The fixture spans more than the two measured pages. Jump to its last page boundary.
  const lastPageStart =
    (Math.ceil(revisionIds.length / promptHistoryPageSize) - 1) * promptHistoryPageSize
  const final = await listCommunityAgentPromptHistory(communityId, {
    before: revisionIds[lastPageStart - 1]!,
  })
  assert.deepEqual(
    final.entries.map(row => row.id),
    revisionIds.slice(lastPageStart),
  )
  assert.equal(final.next_cursor, null)
}

async function assertModeratorActionEnding({ communityId, actionIds }: Fixture, pageSize: number) {
  const final = await searchModeratorActions({
    communityId,
    limit: pageSize,
    actionType: 'warn',
    after: encodeCursor({ id: actionIds[2 * pageSize - 1]! }),
  })
  assert.deepEqual(
    final.results.map(row => row.id),
    actionIds.slice(2 * pageSize),
  )
  assert.equal(final.page_info.has_next_page, false)
  assert.equal(final.page_info.end_cursor, null)
}

async function assertUserModNoteEnding({ noteTargetId, noteIds }: Fixture, pageSize: number) {
  const staff = { ...seedUser, roles: ['moderator'] }
  const final = await listUserModNotes(staff, noteTargetId, {
    limit: pageSize,
    beforeId: noteIds[2 * pageSize - 1]!,
  })
  assert.deepEqual(
    final.notes.map(row => row.id),
    noteIds.slice(2 * pageSize),
  )
  assert.equal(final.hasNextPage, false)
}
