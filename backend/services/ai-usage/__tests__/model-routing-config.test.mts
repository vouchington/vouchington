import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  getOpenAITransport,
  loadServiceModelSelection,
  modelRoutingConfig,
} from '../model-routing-config.mts'

describe('model routing config', () => {
  it('defaults every service to Haiku 5.5 through the direct transport', async () => {
    await modelRoutingConfig.waitForInitialization()

    await expect(loadServiceModelSelection('autotagger-agent')).resolves.toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    })
    expect(getOpenAITransport()).toBe('direct')
  })

  it('reads a switched service and the global transport without a deploy', async () => {
    await modelRoutingConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(modelRoutingConfig, {
      openai_transport: 'direct',
      story_post_provider: 'openai',
      story_post_model: 'gpt-6-luna',
    })
    try {
      await expect(loadServiceModelSelection('story-post')).resolves.toEqual({
        provider: 'openai',
        model: 'gpt-6-luna',
      })
      await expect(loadServiceModelSelection('report-judgement')).resolves.toMatchObject({
        provider: 'anthropic',
      })
      expect(getOpenAITransport()).toBe('direct')
    } finally {
      restore()
    }
  })
})
