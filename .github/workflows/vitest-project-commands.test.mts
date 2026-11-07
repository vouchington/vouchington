import { describe, expect, it } from 'vitest'
import { createVitestProjectCommandFixture } from '../../ci/test-helpers/vitest-project-command-fixtures.mts'
import { vitestProjectCommandPolicyViolations } from '../../ci/vitest-project-command-policy.mts'

const registeredWorkflowProjects = ['static-analysis-ast-grep'] as const

describe('durable Vitest workflow command policy fixtures', () => {
  it('accepts the finite source-only control', () => {
    expect(
      vitestProjectCommandPolicyViolations(
        createVitestProjectCommandFixture(),
        registeredWorkflowProjects,
      ),
    ).toEqual([])
  })

  it('rejects an individual test-file selector', () => {
    const sources = createVitestProjectCommandFixture()
    sources['.github/workflows/tests-web.yml'] = sources[
      '.github/workflows/tests-web.yml'
    ]!.replace(
      '--project synthetic-suite',
      '--project synthetic-suite backend/example.mock.test.mts',
    )

    expect(vitestProjectCommandPolicyViolations(sources, registeredWorkflowProjects)).toContain(
      '.github/workflows/tests-web.yml has a Vitest command selecting an individual test file',
    )
  })

  it('rejects missing coverage gates and CLI coverage flags', () => {
    const sources = createVitestProjectCommandFixture()
    sources['.github/workflows/tests-web.yml'] = sources[
      '.github/workflows/tests-web.yml'
    ]!.replace(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
      'VITEST_COVERAGE_ENABLED: true',
    )
    sources['.github/workflows/tests-lambdas.yml'] = sources[
      '.github/workflows/tests-lambdas.yml'
    ]!.replace('--project synthetic-suite', '--project synthetic-suite --coverage')

    const violations = vitestProjectCommandPolicyViolations(sources, registeredWorkflowProjects)
    expect(violations).toContain(
      '.github/workflows/tests-web.yml must gate coverage on publish_coverage',
    )
    expect(violations).toContain(
      '.github/workflows/tests-lambdas.yml must gate Vitest coverage through its environment, not CLI flags',
    )
  })

  it('retains the original literal coverage gate requirement', () => {
    const sources = createVitestProjectCommandFixture()
    const path = '.github/workflows/tests-web.yml'
    sources[path] = sources[path]!.replace(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
      "VITEST_COVERAGE_ENABLED: \"${{ inputs.publish_coverage && 'true' || 'false' }}\"",
    )
    expect(vitestProjectCommandPolicyViolations(sources, registeredWorkflowProjects)).toEqual([
      '.github/workflows/tests-web.yml must gate coverage on publish_coverage',
    ])
  })

  it('retains the original raw-source CLI coverage prohibition', () => {
    const sources = createVitestProjectCommandFixture()
    sources['.github/workflows/tests-web.yml'] += '# vitest run --coverage\n'
    expect(vitestProjectCommandPolicyViolations(sources, registeredWorkflowProjects)).toEqual([
      '.github/workflows/tests-web.yml must gate Vitest coverage through its environment, not CLI flags',
    ])
  })

  it('retains the original command substring matching', () => {
    const sources = createVitestProjectCommandFixture()
    const path = '.github/workflows/tests-web.yml'
    sources[path] = sources[path]!.replace(
      'pnpm exec vitest run --project synthetic-suite',
      'xvitest run bad.test.ts',
    )
    expect(vitestProjectCommandPolicyViolations(sources, registeredWorkflowProjects)).toEqual([
      '.github/workflows/tests-web.yml has a Vitest command selecting an individual test file',
    ])
  })

  it('rejects lost project ownership, portability setup, or web config routing', () => {
    const sources = createVitestProjectCommandFixture()
    sources['ci/run-vitest-project-group.mts'] = sources[
      'ci/run-vitest-project-group.mts'
    ]!.replaceAll("'lambdas-portability'", "'wrong-project'").replaceAll(
      "'cloudflare-worker-portability'",
      "'wrong-worker-project'",
    )
    sources['.github/workflows/tests-portability.yml'] = sources[
      '.github/workflows/tests-portability.yml'
    ]!.replace(
      'vouchington/vouchington-tooling/.github/actions/setup-node-pnpm@',
      'vouchington/vouchington-tooling/.github/actions/other@',
    )
    sources['.github/workflows/main-storybook.yml'] = 'paths: []\n'

    const violations = vitestProjectCommandPolicyViolations(sources, registeredWorkflowProjects)
    expect(violations).toContain('the Vitest project groups must include lambdas-portability')
    expect(violations).toContain(
      'the Vitest project groups must include cloudflare-worker-portability',
    )
    expect(violations).toContain(
      'tests-portability must use the full-workspace setup action exactly once',
    )
    expect(violations).toContain(
      '.github/workflows/main-storybook.yml must route web Vitest project config changes',
    )
  })

  it('rejects lost checklist, tooling-registry, portability, or Storybook contracts', () => {
    const sources = createVitestProjectCommandFixture()
    sources['docs/checklists/github-actions.md'] = 'Run the test suite.\n'
    sources['.github/workflows/AGENTS.md'] +=
      'Run pnpm exec vitest run --project github-actions here.\n'
    sources['.github/workflows/tests-portability.yml'] += '      - run: pnpm install\n'
    sources['.github/workflows/storybook.yml'] = 'jobs: {}\n'

    const violations = vitestProjectCommandPolicyViolations(sources, [])
    expect(violations).toContain(
      'GitHub Actions checklist must document the github-actions Vitest command',
    )
    expect(violations).toContain(
      'workflow instructions must defer the github-actions command to the checklist',
    )
    expect(violations).toContain(
      'the tooling workflow project registry must contain static-analysis-ast-grep',
    )
    expect(violations).toContain(
      'tests-portability must not install inline outside the shared setup action',
    )
    expect(violations).toContain('Storybook browser coverage must be gated by publish_coverage')
  })
})
