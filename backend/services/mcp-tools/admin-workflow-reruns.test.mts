import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { createStaffResolutionFixture } from '@voucha/test-helpers/staff-resolution-history'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { expectStaffOperationHistory } from '@voucha/test-helpers/staff-operation-history'
import { ai_agents } from '@queues/ai-agents/queues'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const invoke = (user: PrivateUser, name: string, id: string) =>
  callMcpTool(
    name,
    { id },
    { ...user, membership_plan: null },
    ['moderation:ai-rerun'],
    ADMIN_MCP_SERVER_CONFIG,
  )

describe('registered AI rerun writes', () => {
  it.each(['appeal', 'dispute'] as const)(
    'reruns a pending %s with persisted operation history and an owned queue job',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const { id } = await createStaffResolutionFixture(kind, false)
      const result = await invoke(admin, `rerun_${kind}_resolution_draft`, id)
      expect(result.isError).not.toBe(true)
      await expectStaffOperationHistory(admin.id, `${kind}_resolution_draft_rerun`)
      const jobs = await readAllQueueJobs(ai_agents)
      expect(jobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: `${kind}-resolution`,
            data: expect.objectContaining({ [`${kind}_id`]: id, rerun_by_id: admin.id }),
          }),
        ]),
      )
    },
  )

  it('reruns a report judgement with actor history and the exact report queued', async () => {
    const admin = await createTestUser({ administrator: true })
    const owner = await createTestUser()
    const reporter = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      createdById: owner.id,
      title: suffix,
      slug: `rerun-${suffix}`,
      markdown: 'Rerun fixture',
    })
    const id = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    expect((await invoke(admin, 'rerun_report_judgement', id)).isError).not.toBe(true)
    await expectStaffOperationHistory(admin.id, 'report_judgement_rerun')
    expect(await readAllQueueJobs(ai_agents)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'report-judgement',
          data: expect.objectContaining({
            triggering_report_id: id,
            entity_id: postId,
            rerun_by_id: admin.id,
          }),
        }),
      ]),
    )
  })

  it.each([
    'rerun_report_judgement',
    'rerun_appeal_resolution_draft',
    'rerun_dispute_resolution_draft',
  ])('%s refuses an unknown target before history or enqueue', async name => {
    const admin = await createTestUser({ administrator: true })
    const result = await invoke(admin, name, randomUUID())
    expect(result.isError).toBe(true)
    const block = result.content[0]!
    if (block.type !== 'text') throw new Error('Expected typed error')
    expect(JSON.parse(block.text)).toMatchObject({ error: { status: 404, retryable: false } })
    expect(await readStaffActionHistory(admin.id)).toEqual([])
    const owned = (await readAllQueueJobs(ai_agents)).filter(
      job => 'rerun_by_id' in job.data && job.data.rerun_by_id === admin.id,
    )
    expect(owned).toEqual([])
  })
})
