import { describe, expect, it } from 'vitest'
import type { MessageKey } from '@ts-shared/ui-messages'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import { publicProvenanceLabel } from '../post-provenance-label'

type Provenance = Parameters<typeof publicProvenanceLabel>[1]

const label = (provenance: Provenance, names?: ReadonlyMap<string, MessageKey>) =>
  publicProvenanceLabel(defaultTranslator, provenance, names)

describe('publicProvenanceLabel', () => {
  it('words the channel when no app is named', () => {
    expect(label({ via: 'api', app: null })).toBe('via API')
    expect(label({ via: 'mcp', app: null })).toBe('via MCP')
  })

  it('names a metadata-document client by its hostname', () => {
    expect(label({ via: 'api', app: { kind: 'hostname', hostname: 'agent.example' } })).toBe(
      'via agent.example',
    )
  })

  it('names a verified client by its registered name', () => {
    expect(
      label({
        via: 'mcp',
        app: { kind: 'verified', client_id: 'voucha_fixture_agent', client_name: 'Fixture Agent' },
      }),
    ).toBe('via Fixture Agent')
  })

  describe('a known app', () => {
    // An existing alias stands in for an app's name copy, as the allowlist is empty.
    const names = new Map<string, MessageKey>([['fixture-agent', 'shared.accountType.official']])

    it('is named by the catalog copy its key maps to', () => {
      expect(label({ via: 'mcp', app: { kind: 'known', key: 'fixture-agent' } }, names)).toBe(
        'via Official',
      )
    })

    it('falls back to the channel, never the raw key, when the key has no copy', () => {
      expect(label({ via: 'mcp', app: { kind: 'known', key: 'other-agent' } }, names)).toBe(
        'via MCP',
      )
      expect(label({ via: 'api', app: { kind: 'known', key: 'other-agent' } }, names)).toBe(
        'via API',
      )
    })
  })
})
