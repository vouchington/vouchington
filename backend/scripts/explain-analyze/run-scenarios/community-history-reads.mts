import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { listCommunityAgentPromptHistory } from '@services/community-agent-prompts/history'
import { getCommunitySavedReplies } from '@services/modmail/saved-replies'
import { searchModeratorActions } from '@services/moderator-actions'
import { listUserModNotes } from '@services/user-mod-notes/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedCommunityHistoryReads } from './community-history-reads-fixture.mts'
import { assertCommunityHistoryEndings } from './community-history-read-endings.mts'

const pageSize = 100
// The HTTP history route has no limit argument and uses the service's default.
const promptHistoryPageSize = 20

export async function runCommunityHistoryReadScenarios(): Promise<void> {
  const fixture = await seedCommunityHistoryReads()
  try {
    await write(`/* analyzeCommunityHistoryReads */
      ANALYZE community_saved_replies, community_agent_prompt_revisions, moderator_actions, user_moderator_notes`)
    await runSavedReplies(fixture)
    await runPromptHistory(fixture)
    await runModeratorActions(fixture)
    await runUserModNotes(fixture)
    await assertCommunityHistoryEndings(fixture, pageSize, promptHistoryPageSize)
  } finally {
    await fixture.cleanup()
  }
}

type Fixture = Awaited<ReturnType<typeof seedCommunityHistoryReads>>

async function runSavedReplies({ communityId, replies, seededRows }: Fixture) {
  const scenario = 'community-saved-replies-at-cap'
  const name = 'getCommunitySavedReplies'
  registerScenarioContract(scenario, {
    seededRows,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'community_saved_replies', max: pageSize + 2 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await getCommunitySavedReplies(communityId, { limit: pageSize })
      assert.equal(first.length, pageSize + 1)
      assert.deepEqual(
        first.map(row => row.id),
        replies.slice(0, pageSize + 1).map(row => row.id),
      )
      const last = first[pageSize - 1]!
      const next = await getCommunitySavedReplies(communityId, {
        limit: pageSize,
        after: { ranking: last.order_index, id: last.id },
      })
      assert.equal(next.length, pageSize + 1)
      assert.deepEqual(
        next.map(row => row.id),
        replies.slice(pageSize, 2 * pageSize + 1).map(row => row.id),
      )
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

async function runPromptHistory({ communityId, revisionIds, seededRows }: Fixture) {
  const scenario = 'community-agent-prompt-history-at-caller-bound'
  const name = 'listCommunityAgentPromptHistory'
  registerScenarioContract(scenario, {
    seededRows,
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'community_agent_prompt_revisions',
        max: promptHistoryPageSize + 1,
      },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await listCommunityAgentPromptHistory(communityId)
      assert.deepEqual(
        first.entries.map(row => row.id),
        revisionIds.slice(0, promptHistoryPageSize),
      )
      assert.equal(first.next_cursor, revisionIds[promptHistoryPageSize - 1])
      const next = await listCommunityAgentPromptHistory(communityId, {
        before: first.next_cursor!,
      })
      assert.deepEqual(
        next.entries.map(row => row.id),
        revisionIds.slice(promptHistoryPageSize, 2 * promptHistoryPageSize),
      )
      assert.equal(next.next_cursor, revisionIds[2 * promptHistoryPageSize - 1])
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

async function runModeratorActions({ communityId, actionIds, seededRows }: Fixture) {
  const scenario = 'search-moderator-actions-community-at-cap'
  const name = 'searchModeratorActions'
  registerScenarioContract(scenario, {
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_moderator_actions__community__type__id'] },
      { kind: 'maxProcessedRows', relation: 'moderator_actions', max: 215 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const options = { communityId, limit: pageSize, actionType: 'warn' } as const
      const first = await searchModeratorActions(options)
      assert.deepEqual(
        first.results.map(row => row.id),
        actionIds.slice(0, pageSize),
      )
      assert.equal(first.page_info.has_next_page, true)
      assert.equal(first.page_info.end_cursor, encodeCursor({ id: actionIds[pageSize - 1]! }))
      const next = await searchModeratorActions({ ...options, after: first.page_info.end_cursor! })
      assert.deepEqual(
        next.results.map(row => row.id),
        actionIds.slice(pageSize, 2 * pageSize),
      )
      assert.equal(next.page_info.has_next_page, true)
      assert.equal(next.page_info.end_cursor, encodeCursor({ id: actionIds[2 * pageSize - 1]! }))
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

async function runUserModNotes({ noteTargetId, noteIds, seededRows }: Fixture) {
  const scenario = 'list-user-mod-notes-at-cap'
  const name = 'listUserModNotes'
  registerScenarioContract(scenario, {
    seededRows,
    // This is the current main plan's worst observed scan. Tighten in #6395.
    expectations: [{ kind: 'maxProcessedRows', relation: 'user_moderator_notes', max: 3_391 }],
  })
  await runAndCapture(
    scenario,
    async () => {
      const staff = { ...seedUser, roles: ['moderator'] }
      const first = await listUserModNotes(staff, noteTargetId, { limit: pageSize })
      assert.deepEqual(
        first.notes.map(row => row.id),
        noteIds.slice(0, pageSize),
      )
      assert.equal(first.hasNextPage, true)
      const next = await listUserModNotes(staff, noteTargetId, {
        limit: pageSize,
        beforeId: first.notes.at(-1)!.id,
      })
      assert.deepEqual(
        next.notes.map(row => row.id),
        noteIds.slice(pageSize, 2 * pageSize),
      )
      assert.equal(next.hasNextPage, true)
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}
