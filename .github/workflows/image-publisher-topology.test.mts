import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = { env?: Record<string, string>; id?: string; if?: string; run?: string }
type Job = { if?: string; needs?: string; outputs?: Record<string, string>; steps?: Step[] }
type Workflow = { jobs?: Record<string, Job> }

function publisher(group: 'backend' | 'web'): Workflow {
  return load(readFileSync(`.github/workflows/publish-${group}-images.yml`, 'utf8')) as Workflow
}

function step(job: Job | undefined, id: string): Step {
  const found = job?.steps?.find(candidate => candidate.id === id)
  if (!found) throw new Error(`missing ${id} step`)
  return found
}

describe.each(['backend', 'web'] as const)('%s image publisher', group => {
  const workflow = publisher(group)
  const resolver = workflow.jobs?.['resolve-main-images']
  const build = workflow.jobs?.build

  it('resolves merge-queue images only for a trusted main push', () => {
    expect(resolver?.if).toContain('inputs.trusted_secret_context')
    expect(resolver?.if).toContain("github.event_name == 'push'")
    expect(resolver?.if).toContain("github.ref == 'refs/heads/main'")
    const resolve = step(resolver, 'resolve')
    expect(resolve.run).toBe(`./ci/resolve-published-images.sh ${group}`)
    expect(resolve.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    expect(resolver?.outputs?.['missing_targets']).toBe(
      '${{ steps.resolve.outputs.missing_targets }}',
    )
  })

  it('validates PRs, publishes merge groups, and builds on main only for missing images', () => {
    expect(build?.needs).toBe('resolve-main-images')
    const condition = build?.if ?? ''
    expect(condition).toContain('!cancelled()')
    expect(condition).toContain(
      "github.event_name == 'pull_request' && startsWith(github.ref, 'refs/pull/')",
    )
    expect(condition).toContain(
      "github.event_name == 'merge_group' && startsWith(github.ref, 'refs/heads/gh-readonly-queue/main/')",
    )
    expect(condition).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.resolve-main-images.result == 'success' && needs.resolve-main-images.outputs.missing_targets != '[]'",
    )
  })

  it('never publishes from a pull request', () => {
    expect(step(build, 'publish').if).toBe(
      "${{ success() && (github.event_name == 'merge_group' || github.event_name == 'push') }}",
    )
  })
})

describe('backend main fallback', () => {
  it('publishes only the images the merge group did not', () => {
    const publish = step(publisher('backend').jobs?.build, 'publish')
    expect(publish.env?.['MISSING_TARGETS']).toBe(
      '${{ needs.resolve-main-images.outputs.missing_targets }}',
    )
    expect(publish.run).toContain(`targets=$(jq -r '.[]' <<<"$MISSING_TARGETS")`)
    expect(publish.run).toContain('targets="api $ACTIVE_WORKER_IMAGES"')
  })
})
