import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { computeTranscriptFactsFromFiles } from '../compute-stream.mts'

const fixturesDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url))

function fixturePath(name: string): string {
  return fileURLToPath(new URL(name, `file://${fixturesDirectory}/`))
}

describe('computeTranscriptFactsFromFiles Codex message records', () => {
  it('counts current response_item message roles from a synthetic fixture', async () => {
    await expect(
      computeTranscriptFactsFromFiles(fixturePath('codex-current-messages.jsonl')),
    ).resolves.toEqual({
      facts: expect.objectContaining({ userPrompts: 2, assistantResponses: 2 }),
    })
  })

  it('retains legacy message-event counts from a synthetic fixture', async () => {
    await expect(
      computeTranscriptFactsFromFiles(fixturePath('codex-legacy-messages.jsonl')),
    ).resolves.toEqual({
      facts: expect.objectContaining({ userPrompts: 2, assistantResponses: 1 }),
    })
  })

  it('counts mixed record shapes without double counting current messages', async () => {
    await expect(
      computeTranscriptFactsFromFiles(fixturePath('codex-mixed-messages.jsonl')),
    ).resolves.toEqual({
      facts: expect.objectContaining({ userPrompts: 2, assistantResponses: 2 }),
    })
  })
})
