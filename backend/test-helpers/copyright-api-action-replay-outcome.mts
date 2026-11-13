import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { expect } from 'vitest'
import type { createRequest } from './api/server.mts'
import { readApiGuestState } from './copyright-api-guest-state.mts'

/** A real operator replay resets only the failed work item and adds its one case-owned audit. */
export async function assertApiActionReplay(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  intentId: string
  actorId: string
}) {
  const read = async () => {
    const [state, { rows: attempts }, { rows: results }] = await Promise.all([
      readApiGuestState(input.noticeId),
      write(
        sql`/* readApiActionReplay:attempts */ SELECT * FROM copyright_notice_action_attempts WHERE work_item_id = ${input.intentId} ORDER BY attempt_number`,
      ),
      write(
        sql`/* readApiActionReplay:results */ SELECT result.* FROM copyright_notice_action_attempt_results result JOIN copyright_notice_action_attempts attempt ON attempt.id = result.attempt_id WHERE attempt.work_item_id = ${input.intentId} ORDER BY attempt.attempt_number`,
      ),
    ])
    return { ...state, attempts, results }
  }
  const before = await read()
  expect(before.attempts).toHaveLength(5)
  expect(before.results).toEqual(
    Array.from({ length: 5 }, () =>
      expect.objectContaining({
        failed_at: expect.any(Date),
        completed_at: null,
        blocked_at: null,
        stale_at: null,
        abandoned_at: null,
      }),
    ),
  )
  expect(before.aggregate.actionIntents.find(row => row.id === input.intentId)).toMatchObject({
    state: 'failed',
    attempt_count: 5,
    generation: '1',
  })
  const response = await input.staff.post(
    `/api/v1/copyright-notices/${input.noticeId}/action-intents/${input.intentId}/replays`,
  )
  const after = await read()
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      body: undefined,
      state: before,
    },
    {
      status: 200,
      code: undefined,
      message: undefined,
      body: { replayed: true },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        activity: { ...before.activity, lifecycle: expect.any(Date) },
        aggregate: {
          ...before.aggregate,
          actionIntents: before.aggregate.actionIntents.map(row =>
            row.id === input.intentId
              ? {
                  ...row,
                  state: 'pending',
                  attempt_count: 0,
                  generation: '2',
                  leased_at: null,
                  completed_at: null,
                  completed_at_reason: null,
                  available_at: expect.any(Date),
                  updated_at: expect.any(Date),
                  failure_message: 'Explicit operator replay after external delivery failure.',
                }
              : row,
          ),
          lifecycleEvents: [
            ...before.aggregate.lifecycleEvents,
            expect.objectContaining({
              copyright_notice_id: input.noticeId,
              change_type: 'copyright_action_replayed',
              changed_by_id: input.actorId,
              copyright_notice_action_intent_id: input.intentId,
              replay_reason: 'operator_replay',
            }),
          ],
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    body: response.status === 200 ? response.body : undefined,
    state: after,
  })
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
