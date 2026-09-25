import { describe, expect, it } from 'vitest'

import { applyCommand, createEmptyFacts } from '../compute-shared.mts'

describe('applyCommand', () => {
  it('counts a no-mistakes invocation that is not also a git push', () => {
    const facts = createEmptyFacts()
    applyCommand('pnpm run no-mistakes', facts)
    expect(facts.noMistakesInvocations).toBe(1)
    expect(facts.pushCommandAttempts).toBe(0)
  })

  it('counts a git push invocation that is not also a no-mistakes run', () => {
    const facts = createEmptyFacts()
    applyCommand('git push origin HEAD', facts)
    expect(facts.noMistakesInvocations).toBe(0)
    expect(facts.pushCommandAttempts).toBe(1)
  })

  it('counts neither for a command matching no tracked invocation', () => {
    const facts = createEmptyFacts()
    applyCommand('git status', facts)
    expect(facts.noMistakesInvocations).toBe(0)
    expect(facts.pushCommandAttempts).toBe(0)
  })
})
