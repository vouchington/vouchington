import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('web integration workflow', () => {
  it('provides an image origin to full-stack web integration tests', () => {
    const workflow = readFileSync('.github/workflows/tests-web-integration.yml', 'utf8')

    expect(workflow).toContain('IMAGE_ORIGIN: http://127.0.0.1:3100')
  })

  it('keeps full-stack setup while sharding only the web-integration project', () => {
    const workflow = readFileSync('.github/workflows/tests-web-integration.yml', 'utf8')

    expect(workflow).toContain('node ci/vitest/shard-total.mts test-web-integration')
    expect(workflow).toContain('total: ${{ steps.shard-total.outputs.shard-total }}')
    expect(workflow).toContain('shard: ${{ fromJSON(needs.prep.outputs.shard-matrix) }}')
    expect(workflow).toContain('runs-on: ubuntu-latest')
    expect(workflow).toContain('uses: ./.github/actions/build-web-targets')
    expect(workflow).toContain('--project web-integration --shard ${{ matrix.shard }}')
    expect(workflow).not.toContain('--project web-api')
    expect(workflow).not.toContain('max-parallel')
    expect(workflow).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(workflow).not.toContain('--coverage')
    expect(workflow).toContain('web-integration-shard-${{ matrix.shard }}')
    expect(workflow).toContain(
      'CI_SHARD: ${{ matrix.shard }}/${{ needs.prep.outputs.shard-total }}',
    )
  })

  it('builds once before standalone fan-out and rebuilds in a shard on cache miss', () => {
    const workflow = readFileSync('.github/workflows/tests-web-integration.yml', 'utf8')
    const prep = workflow.split('\n  prep:')[1]?.split('\n  web-integration-tests:')[0]
    const tests = workflow.split('\n  web-integration-tests:')[1]
    expect(prep).toContain("!inputs.shared_build_available && steps.shards.outputs.total != '1'")
    expect(prep).toContain('shared-build-cache-mode: producer')
    expect(tests).toContain('shared-build-cache-mode: consumer')
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain(
      "shared_build_available: ${{ needs.static-web.result == 'success' }}",
    )
  })
})
