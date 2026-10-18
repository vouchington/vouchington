import { describe, expect, it } from 'vitest'
import { upsertSchedules as upsertAiAgentsSchedules } from '@queues/ai-agents/enqueues/schedules'
import { upsertSchedules as upsertQueueMetricsSchedules } from '@queues/heartbeat/enqueues/schedules'
import { upsertBackgroundCpuSchedules } from './background-cpu-schedules.mts'
import { SCHEDULE_DEFINITIONS } from './schedule-definitions.mts'
import { SCHEDULE_DEFINITIONS as IO_SCHEDULE_DEFINITIONS } from '@entrypoints/worker-io/definitions'

const cpuOnlySchedules = SCHEDULE_DEFINITIONS.filter(
  definition => !IO_SCHEDULE_DEFINITIONS.some(io => io.queueName === definition.queueName),
)

describe('worker-cpu schedule definitions', () => {
  it('each schedule definition load resolves to the expected export', async () => {
    const byQueue = (name: string) =>
      cpuOnlySchedules.find(definition => definition.queueName === name)!

    await expect(byQueue('background-cpu').load()).resolves.toBe(upsertBackgroundCpuSchedules)
    await expect(byQueue('ai_agents').load()).resolves.toBe(upsertAiAgentsSchedules)
    await expect(byQueue('heartbeat').load()).resolves.toBe(upsertQueueMetricsSchedules)
  })
})
