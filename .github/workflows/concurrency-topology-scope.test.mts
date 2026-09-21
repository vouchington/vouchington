import { describe, expect, it } from 'vitest'

import {
  concurrencyScopesMatch,
  extractConcurrencyScopes,
  normalizePolicyScopes,
} from './concurrency-topology-scope.mts'

describe('concurrency topology scope normalization', () => {
  it('classifies pull-request event actions as event scope', () => {
    expect(extractConcurrencyScopes('${{ github.event.action }}')).toEqual(['event'])
    expect(concurrencyScopesMatch('${{ github.event.action }}', ['event'])).toBe(true)
    expect(extractConcurrencyScopes('${{ github.event.workflow_run.event }}')).toEqual(['event'])
  })

  it('rejects a discriminator added to a fixed-resource group', () => {
    expect(normalizePolicyScopes(['fixed-resource'])).toEqual([])
    expect(concurrencyScopesMatch('staging-database', ['fixed-resource'])).toBe(true)
    expect(concurrencyScopesMatch('staging-database-${{ github.sha }}', ['fixed-resource'])).toBe(
      false,
    )
    expect(normalizePolicyScopes(['fixed-resource', 'sha'])).toEqual([
      'unsupported:fixed-resource-combination',
    ])
  })

  it('classifies overlapping GitHub contexts only by their most specific scope', () => {
    expect(
      extractConcurrencyScopes(
        '${{ github.event.pull_request.number || github.event.label.name || github.event.inputs || inputs.service || github.event.workflow_run.head_sha || github.event.workflow_run.id || github.workflow || github.run_attempt }}',
      ),
    ).toEqual(['pull-request', 'sha', 'event', 'input-resource'])
  })

  it('classifies workflow_run.head_branch as ref scope, distinct from head_sha', () => {
    // head_branch is a mutable branch name (same category as github.ref_name); head_sha is an
    // exact, immutable commit. Grouping concurrency on the former serializes per-branch, on the
    // latter per-commit — fix-dependabot.yml relies on this distinction to serialize
    // dispatches across a Dependabot rebase (new head_sha, same head_branch).
    expect(extractConcurrencyScopes('${{ github.event.workflow_run.head_branch }}')).toEqual([
      'ref',
    ])
    expect(concurrencyScopesMatch('${{ github.event.workflow_run.head_branch }}', ['ref'])).toBe(
      true,
    )
    expect(concurrencyScopesMatch('${{ github.event.workflow_run.head_branch }}', ['sha'])).toBe(
      false,
    )
  })

  it('classifies a merge-group head ref as ref scope', () => {
    expect(extractConcurrencyScopes('${{ github.event.merge_group.head_ref }}')).toEqual(['ref'])
  })

  it('classifies an exact pull-request head as SHA scope', () => {
    expect(extractConcurrencyScopes('${{ github.event.pull_request.head.sha }}')).toEqual(['sha'])
    expect(concurrencyScopesMatch('${{ github.event.pull_request.head.sha }}', ['sha'])).toBe(true)
  })

  it('classifies a workflow-run pull-request association as pull-request scope', () => {
    expect(
      extractConcurrencyScopes(
        '${{ github.event.workflow_run.pull_requests[0].number }}-${{ github.event.workflow_run.head_sha }}',
      ),
    ).toEqual(['pull-request', 'sha'])
  })

  it('compares exact normalized scope sets', () => {
    const group = '${{ github.ref_name || github.sha }}'
    expect(normalizePolicyScopes(['sha', 'ref'])).toEqual(['ref', 'sha'])
    expect(concurrencyScopesMatch(group, ['sha', 'ref'])).toBe(true)
    expect(concurrencyScopesMatch(group, ['ref'])).toBe(false)
    expect(extractConcurrencyScopes('${{ github.event_name }}')).toEqual(['event'])
    expect(extractConcurrencyScopes('${{ github.actor }}')).toEqual(['unsupported:github.actor'])
    expect(
      extractConcurrencyScopes('${{ github.repository_owner || github.actor || github.sha }}'),
    ).toEqual(['sha', 'unsupported:github.actor', 'unsupported:github.repository_owner'])
  })
})
