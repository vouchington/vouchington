import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  deleteTestCommunityAgentPrompt,
  getTestAgentModerationTransparencyStamp,
  getTestCommunityAgentPromptLockFunctionDefinition,
  getTestModerationTransparencyDeleteRollupFunctionDefinitions,
  getTestModerationTransparencyRollupFunctionDefinition,
  getTestModerationTransparencyClearanceRollupFunctionDefinition,
  hardDeleteTestModerationPrompt,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestPost,
  setTestAgentDeletedHalfMillisecondAfter,
  setTestCommunityAgentPromptDeletedAt,
  setTestCommunityAgentPromptDeletedHalfMillisecondAfter,
  setTestModerationPromptDeletedHalfMillisecondAfter,
} from '@voucha/test-helpers'

describe('moderation transparency agent rollup boundaries', () => {
  it('aggregates every hard-delete source through ordered transition tables', async () => {
    const definitions = await getTestModerationTransparencyDeleteRollupFunctionDefinitions()
    const expectedTransitionTables = {
      fn_moderation_transparency_reports_delete_rollup: 'deleted_reports',
      fn_moderation_transparency_actions_delete_rollup: 'deleted_actions',
      fn_moderation_transparency_agent_delete_rollup: 'deleted_agent_moderations',
      fn_moderation_transparency_appeals_delete_rollup: 'deleted_appeals',
      fn_moderation_transparency_clearance_delete_rollup: 'deleted_clearance_changes',
    }
    expect(Object.keys(definitions).sort()).toEqual(Object.keys(expectedTransitionTables).sort())
    for (const [name, transitionTable] of Object.entries(expectedTransitionTables)) {
      const definition = definitions[name]!
      expect(definition).toContain(`FROM ${transitionTable}`)
      expect(definition).toContain('GROUP BY 1, 2, 3, 4')
      expect(definition).toContain('ORDER BY 1, 2 NULLS FIRST, 3, 4')
      expect(definition).toContain('fn_apply_moderation_transparency_daily_rollup')
    }
  })

  it('uses an exclusive cascade barrier and shared positive-ingestion barrier before cohort locks', async () => {
    const definition = await getTestModerationTransparencyRollupFunctionDefinition()
    const writeLock = definition.indexOf("'moderation-transparency-rollup-write'")
    const cohortLock = definition.indexOf("'moderation-transparency-rollup:'")
    expect(writeLock).toBeGreaterThan(-1)
    expect(writeLock).toBeLessThan(cohortLock)
    expect(definition).toContain('IF p_delta < 0 THEN')
    expect(definition).toContain('pg_advisory_xact_lock_shared')
    expect(definition).toContain('pg_advisory_xact_lock(hashtextextended')
    const clearanceDefinition =
      await getTestModerationTransparencyClearanceRollupFunctionDefinition()
    expect(clearanceDefinition).toContain('ORDER BY 1, 2 NULLS FIRST, 3, 4')
    expect(clearanceDefinition).toContain(
      'change.moderation_transparency_community_id AS community_id',
    )
    expect(clearanceDefinition).not.toContain(
      'AND change.moderation_transparency_community_id IS NULL',
    )
  })

  it('takes projection locks only for CAP inserts, after its parent lock', async () => {
    const definition = await getTestCommunityAgentPromptLockFunctionDefinition()
    const parentLock = definition.indexOf('FROM agent_prompts WHERE id = v_prompt_id FOR KEY SHARE')
    expect(parentLock).toBeGreaterThan(-1)
    expect(parentLock).toBeLessThan(
      definition.indexOf("fn_lock_moderation_transparency_projection('agent', v_agent_id)"),
    )
    expect(definition).toContain("IF TG_OP <> 'INSERT' THEN")
    expect(definition).toContain('These lifecycle changes deliberately leave prior stamps alone.')
  })

  it('does not deadlock a hard prompt cascade with concurrent CAP update or delete', async () => {
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    for (const operation of [
      (promptId: string) => setTestCommunityAgentPromptDeletedAt(promptId, new Date()),
      (promptId: string) => deleteTestCommunityAgentPrompt(promptId),
    ]) {
      const community = await insertTestCommunity({ createdById: owner.id })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })
      const postId = await insertBoundaryPost(community.id, author.id)
      await insertTestAgentModeration({ postId, promptId: prompt.id, agentId: prompt.agent_id })
      const [deletion, mutation] = await Promise.allSettled([
        hardDeleteTestModerationPrompt(prompt.id),
        operation(prompt.id),
      ])
      expect(deletion).toMatchObject({ status: 'fulfilled' })
      if (mutation.status === 'rejected') throw mutation.reason
    }
  })

  it('fails closed when an agent, prompt, or CAP is deleted in the event millisecond', async () => {
    const eventAt = await uniqueTransparencyNow()
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    for (const setDeletedAt of [
      (prompt: { id: string; agent_id: string }) =>
        setTestAgentDeletedHalfMillisecondAfter(prompt.agent_id, eventAt),
      (prompt: { id: string; agent_id: string }) =>
        setTestModerationPromptDeletedHalfMillisecondAfter(prompt.id, eventAt),
      (prompt: { id: string; agent_id: string }) =>
        setTestCommunityAgentPromptDeletedHalfMillisecondAfter(prompt.id, eventAt),
    ]) {
      const community = await insertTestCommunity({ createdById: owner.id })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })
      await setDeletedAt(prompt)
      const moderationId = await insertTestAgentModeration({
        postId: await insertBoundaryPost(community.id, author.id),
        promptId: prompt.id,
        agentId: prompt.agent_id,
        occurredAt: eventAt,
      })
      await expect(getTestAgentModerationTransparencyStamp(moderationId)).resolves.toMatchObject({
        category: null,
        communityId: null,
      })
    }
  })
})

async function insertBoundaryPost(communityId: string, authorId: string): Promise<string> {
  const suffix = crypto.randomUUID()
  return insertTestPost({
    title: `Transparency boundary ${suffix}`,
    slug: `transparency-boundary-${suffix}`,
    createdById: authorId,
    markdown: 'Test moderation transparency boundary.',
    communityId,
  })
}

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
