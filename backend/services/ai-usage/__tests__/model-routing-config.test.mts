import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  getOpenAITransport,
  getServiceModelSelection,
  modelRoutingConfig,
} from '../model-routing-config.mts'

describe('model routing config', () => {
  it('defaults every service to Haiku 5.5 through the OpenRouter transport', async () => {
    await modelRoutingConfig.waitForInitialization()

    expect(getServiceModelSelection('autotagger-agent')).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    })
    expect(getOpenAITransport()).toBe('openrouter')
  })

  it('reads a switched service and the global transport without a deploy', async () => {
    await modelRoutingConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(modelRoutingConfig, {
      openai_transport: 'direct',
      story_post_provider: 'openai',
      story_post_model: 'gpt-6-luna',
    })
    try {
      expect(getServiceModelSelection('story-post')).toEqual({
        provider: 'openai',
        model: 'gpt-6-luna',
      })
      expect(getServiceModelSelection('report-judgement').provider).toBe('anthropic')
      expect(getOpenAITransport()).toBe('direct')
    } finally {
      restore()
    }
  })
})
