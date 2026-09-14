import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('web integration workflow', () => {
  it('provides an image origin to full-stack web integration tests', () => {
    const workflow = readFileSync('.github/workflows/tests-web-integration.yml', 'utf8')

    expect(workflow).toContain('IMAGE_ORIGIN: http://127.0.0.1:3100')
  })

  it('keeps full-stack setup while sharding only the web-integration project', () => {
    const workflow = readFileSync('.github/workflows/tests-web-integration.yml', 'utf8')
    const manualInputs = workflow.slice(workflow.indexOf('workflow_dispatch:'))

    expect(workflow).toContain('node ci/vitest/shard-total.mts test-web-integration')
    expect(workflow).toContain('total: ${{ steps.shard-total.outputs.shard-total }}')
    expect(manualInputs).toContain("description: 'Explicit shard count for a selected run'")
    expect(workflow).toContain('shard: ${{ fromJSON(needs.prep.outputs.shard-matrix) }}')
    expect(workflow).toContain('runs-on: [self-hosted, Linux, Docker, Tests, CPU]')
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

  it('preserves a narrowed selection as newline-delimited positional arguments', () => {
    const workflow = readFileSync('.github/workflows/tests-web-integration.yml', 'utf8')
    const script = workflow
      .split('      - name: Run web integration tests')[1]
      ?.split('\n      - name: Download coverage')[0]
    expect(script).toBeTypeOf('string')
    const prefix = script?.slice(
      0,
      script.indexOf('pnpm exec ./ci/with-node-test-options vitest run'),
    )
    const result = spawnSync('bash', ['-c', `${prefix}printf '%s\\n' "\${FILES[@]}"`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FULL_SUITE: 'false',
        SELECTED_TEST_FILES: 'web/foo.test.mts\nweb/space path.test.mts',
      },
    })
    expect(result.status).toBe(0)
    expect(result.stdout.split('\n').filter(Boolean)).toEqual([
      'web/foo.test.mts',
      'web/space path.test.mts',
    ])
  })
})
