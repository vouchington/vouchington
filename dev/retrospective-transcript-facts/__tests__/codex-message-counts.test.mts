import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { computeTranscriptFacts } from '../compute.mts'

const fixturesDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url))

async function fixtureLines(name: string): Promise<string[]> {
  return (await readFile(new URL(name, `file://${fixturesDirectory}/`), 'utf8')).trim().split('\n')
}

describe('computeTranscriptFacts Codex message records', () => {
  it('counts current response_item message roles from a synthetic fixture', async () => {
    const facts = computeTranscriptFacts(await fixtureLines('codex-current-messages.jsonl'))
    expect(facts).toMatchObject({ userPrompts: 2, assistantResponses: 2 })
  })

  it('retains legacy message-event counts from a synthetic fixture', async () => {
    const facts = computeTranscriptFacts(await fixtureLines('codex-legacy-messages.jsonl'))
    expect(facts).toMatchObject({ userPrompts: 2, assistantResponses: 1 })
  })

  it('counts mixed record shapes without double counting current messages', async () => {
    const facts = computeTranscriptFacts(await fixtureLines('codex-mixed-messages.jsonl'))
    expect(facts).toMatchObject({ userPrompts: 2, assistantResponses: 2 })
  })
})
