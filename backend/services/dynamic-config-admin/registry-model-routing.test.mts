import { describe, expect, it } from 'vitest'
import { modelFieldName, providerFieldName } from '@modules/model-providers/routing'
import { getDynamicConfigRegistryEntry } from './registry.mts'
import type { DynamicConfigFields } from './types.mts'

function entry() {
  const registered = getDynamicConfigRegistryEntry('ai-model-routing')
  if (!registered?.validate) throw new Error('ai-model-routing is not registered')
  return registered
}

function defaults(): DynamicConfigFields {
  return { ...entry().config.defaultFields }
}

describe('ai-model-routing registry entry', () => {
  it('defaults every service to Haiku 5.5 and the OpenRouter transport', () => {
    const fields = defaults()
    expect(fields.openai_transport).toBe('openrouter')
    expect(fields[providerFieldName('report-judgement')]).toBe('anthropic')
    expect(fields[modelFieldName('report-judgement')]).toBe('claude-haiku-5-5')
    expect(() => entry().validate?.(fields)).not.toThrow()
  })

  it('is editable by developers only and describes every field', () => {
    const registered = entry()
    expect(registered.access.update_roles).toEqual(['developer'])
    for (const name of Object.keys(registered.config.fieldTypes)) {
      expect(registered.fields[name]?.description).toBeTruthy()
    }
  })

  it('accepts switching a service to a priced OpenAI model and the direct transport', () => {
    const fields = {
      ...defaults(),
      openai_transport: 'direct',
      [providerFieldName('story-post')]: 'openai',
      [modelFieldName('story-post')]: 'gpt-6-luna',
    }
    expect(() => entry().validate?.(fields)).not.toThrow()
  })

  it.each([
    [
      'an unknown provider',
      { provider: 'google', model: 'claude-haiku-5-5' },
      /provider must be one of/,
    ],
    [
      'a model from the other provider',
      { provider: 'anthropic', model: 'gpt-6-luna' },
      /priced anthropic model/,
    ],
    ['an unpriced model', { provider: 'openai', model: 'gpt-9' }, /priced openai model/],
  ])('rejects %s', (_name, selection, message) => {
    const fields = {
      ...defaults(),
      [providerFieldName('dispute-resolution')]: selection.provider,
      [modelFieldName('dispute-resolution')]: selection.model,
    }
    expect(() => entry().validate?.(fields)).toThrow(message)
    expect(() => entry().validate?.(fields)).toThrow(/^dispute-resolution: /)
  })

  it('rejects an invalid OpenAI transport', () => {
    expect(() => entry().validate?.({ ...defaults(), openai_transport: 'proxy' })).toThrow(
      /openai_transport must be one of/,
    )
  })
})
