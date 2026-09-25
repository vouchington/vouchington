import { describe, expect, it } from 'vitest'

import { applyCodexMessage } from '../codex-messages.mts'
import { createEmptyFacts, type ParsedLine } from '../compute-shared.mts'

describe('applyCodexMessage', () => {
  it('does not count a record with no payload', () => {
    const facts = createEmptyFacts()
    const record: ParsedLine = { type: 'event_msg' }
    const matched = applyCodexMessage(record, undefined, facts)
    expect(matched).toBe(false)
    expect(facts.userPrompts).toBe(0)
    expect(facts.assistantResponses).toBe(0)
  })

  it('counts a legacy event_msg user_message as a user prompt', () => {
    const facts = createEmptyFacts()
    const record: ParsedLine = { type: 'event_msg' }
    const matched = applyCodexMessage(record, { type: 'user_message' }, facts)
    expect(matched).toBe(true)
    expect(facts.userPrompts).toBe(1)
  })

  it('counts a legacy event_msg agent_message as an assistant response', () => {
    const facts = createEmptyFacts()
    const record: ParsedLine = { type: 'event_msg' }
    const matched = applyCodexMessage(record, { type: 'agent_message' }, facts)
    expect(matched).toBe(true)
    expect(facts.assistantResponses).toBe(1)
  })

  it('ignores an event_msg payload type it does not recognize', () => {
    const facts = createEmptyFacts()
    const record: ParsedLine = { type: 'event_msg' }
    const matched = applyCodexMessage(record, { type: 'token_count' }, facts)
    expect(matched).toBe(false)
    expect(facts.userPrompts).toBe(0)
    expect(facts.assistantResponses).toBe(0)
  })

  it('counts a current response_item message with role user as a user prompt', () => {
    const facts = createEmptyFacts()
    const record: ParsedLine = { type: 'response_item' }
    const matched = applyCodexMessage(record, { type: 'message', role: 'user' }, facts)
    expect(matched).toBe(true)
    expect(facts.userPrompts).toBe(1)
  })

  it('counts a current response_item message with role assistant as an assistant response', () => {
    const facts = createEmptyFacts()
    const record: ParsedLine = { type: 'response_item' }
    const matched = applyCodexMessage(record, { type: 'message', role: 'assistant' }, facts)
    expect(matched).toBe(true)
    expect(facts.assistantResponses).toBe(1)
  })

  it('ignores a response_item message with a role that is neither user nor assistant', () => {
    const facts = createEmptyFacts()
    const record: ParsedLine = { type: 'response_item' }
    const matched = applyCodexMessage(record, { type: 'message', role: 'system' }, facts)
    expect(matched).toBe(false)
    expect(facts.userPrompts).toBe(0)
    expect(facts.assistantResponses).toBe(0)
  })

  it('ignores a response_item payload that is not a message', () => {
    const facts = createEmptyFacts()
    const record: ParsedLine = { type: 'response_item' }
    const matched = applyCodexMessage(record, { type: 'function_call', role: 'user' }, facts)
    expect(matched).toBe(false)
    expect(facts.userPrompts).toBe(0)
  })
})
