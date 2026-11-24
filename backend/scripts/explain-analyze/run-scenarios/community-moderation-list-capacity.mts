import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { searchApplications } from '@services/communities/applications/get'
import { searchInvites } from '@services/communities/invites/get'
import { searchCommunityRestrictions } from '@services/communities/restrictions/search'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCommunityModerationListCapacity } from './community-moderation-list-capacity-fixture.mts'

const limit = 100

function idCursor(id: string): string {
  return encodeCursor({ name: id, id })
}

export async function runCommunityModerationListCapacityScenarios(): Promise<void> {
  const fixture = await seedCommunityModerationListCapacity()
  const { communityId, communityIds, pendingApplicationIds, inviteIds, pastRestrictionIds } =
    fixture
  try {
    await write(`/* analyzeCommunityModerationListCapacity */
      ANALYZE community_applications, community_application_answers, community_invites, community_restrictions`)
    await runApplicationCapacityScenario(
      communityId,
      pendingApplicationIds,
      fixture.seededApplicationCount,
    )
    await runInviteCapacityScenario(communityId, inviteIds, fixture.seededInviteCount)
    await runRestrictionCapacityScenario(
      communityId,
      pastRestrictionIds,
      fixture.seededRestrictionCount,
    )
  } finally {
    await write(sql`/* deleteCommunityModerationListCapacity */
      DELETE FROM communities WHERE id = ANY(${communityIds}::uuid[])`)
  }
}

async function runApplicationCapacityScenario(
  communityId: string,
  pendingIds: readonly string[],
  seededRows: number,
): Promise<void> {
  const scenario = 'search-community-applications-at-cap'
  registerScenarioContract(scenario, {
    expectations: [],
    seededRows: { community_applications: seededRows, community_application_answers: seededRows },
  })
  const expectedIds = pendingIds.slice(1, limit + 1)
  await runAndCapture(
    scenario,
    async () => {
      const page = await searchApplications(communityId, {
        status: 'pending',
        limit,
        after: idCursor(pendingIds[0]!),
      })
      assert.equal(page.results.length, limit)
      assert.deepEqual(
        page.results.map(row => row.id),
        expectedIds,
      )
      assert.ok(page.results.every(row => row.status === 'pending' && row.answer_count === 1))
      assert.deepEqual(page.page_info, {
        has_next_page: true,
        start_cursor: idCursor(expectedIds[0]!),
        end_cursor: idCursor(expectedIds.at(-1)!),
      })
    },
    undefined,
    'searchApplications',
    { exactCapturedNames: ['searchApplications'] },
  )
}

async function runInviteCapacityScenario(
  communityId: string,
  inviteIds: readonly string[],
  seededRows: number,
): Promise<void> {
  const scenario = 'search-community-invites-at-cap'
  registerScenarioContract(scenario, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_invites__community_id__id_desc'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'community_invites', max: limit + 1 },
    ],
    seededRows: { community_invites: seededRows },
  })
  const start = Math.floor(inviteIds.length / 2)
  const expectedIds = inviteIds.slice(start, start + limit)
  await runAndCapture(
    scenario,
    async () => {
      const page = await searchInvites(communityId, {
        limit,
        after: idCursor(inviteIds[start - 1]!),
      })
      assert.equal(page.results.length, limit)
      assert.deepEqual(
        page.results.map(row => row.id),
        expectedIds,
      )
      assert.deepEqual(page.page_info, {
        has_next_page: true,
        start_cursor: idCursor(expectedIds[0]!),
        end_cursor: idCursor(expectedIds.at(-1)!),
      })
    },
    undefined,
    'searchInvites',
    { exactCapturedNames: ['searchInvites'] },
  )
}

async function runRestrictionCapacityScenario(
  communityId: string,
  pastIds: readonly string[],
  seededRows: number,
): Promise<void> {
  const scenario = 'search-community-restrictions-at-cap'
  registerScenarioContract(scenario, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_restrictions__community__id'],
        noSort: true,
      },
      // The cursor has one active row after it, in addition to the page and its lookahead.
      { kind: 'maxProcessedRows', relation: 'community_restrictions', max: limit + 2 },
    ],
    seededRows: { community_restrictions: seededRows },
  })
  const scope = `community-restrictions:v1:${communityId}:past:id-desc`
  const cursor = (id: string) => encodeScopedUuidCursor(id, scope)
  const expectedIds = pastIds.slice(1, limit + 1)
  await runAndCapture(
    scenario,
    async () => {
      const page = await searchCommunityRestrictions(communityId, {
        status: 'past',
        limit,
        after: cursor(pastIds[0]!),
      })
      assert.equal(page.results.length, limit)
      assert.deepEqual(
        page.results.map(row => row.id),
        expectedIds,
      )
      assert.deepEqual(page.page_info, {
        has_next_page: true,
        start_cursor: cursor(expectedIds[0]!),
        end_cursor: cursor(expectedIds.at(-1)!),
      })
    },
    undefined,
    'searchCommunityRestrictions',
    { exactCapturedNames: ['searchCommunityRestrictions'], useWallClock: true },
  )
}
