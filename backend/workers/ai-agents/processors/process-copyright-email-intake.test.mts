import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type { CopyrightEmailIntakeJobData } from '@queues/ai-agents/types'
import { processCopyrightEmailIntake } from './process-copyright-email-intake.mts'

describe('processCopyrightEmailIntake', () => {
  it('does not send email contents to the model while copyright intake is disabled', async () => {
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'false')
    const callModel = vi.fn<() => Promise<never>>()

    await expect(
      processCopyrightEmailIntake(
        { data: { intake_id: crypto.randomUUID() } } as Job<CopyrightEmailIntakeJobData>,
        callModel,
      ),
    ).resolves.toEqual({ success: true })

    expect(callModel).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
