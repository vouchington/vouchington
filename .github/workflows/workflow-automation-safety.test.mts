import { describe, expect, it } from 'vitest'
import { workflowSafetyViolations } from '../../ci/workflow-safety-policy.mts'

describe('workflow automation safety', () => {
  it('disables local hooks for fixed-branch automation commit and branch update steps', () => {
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: {
          update: {
            steps: [
              {
                run: 'git -c core.hooksPath=/dev/null commit -m update\ngit -c core.hooksPath=/dev/null push origin update',
              },
            ],
          },
        },
      }),
    ).toEqual([])
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: { update: { steps: [{ run: 'git commit -m update\ngit push origin update' }] } },
      }),
    ).toEqual([
      'fixture#update step 0: commit must use -c core.hooksPath=/dev/null',
      'fixture#update step 0: branch update must use -c core.hooksPath=/dev/null',
    ])
  })

  it('passes GH_TOKEN to scheduled GitHub-backed updater CLIs', () => {
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: {
          update: {
            steps: [{ run: 'npx --yes skills update', env: { GH_TOKEN: '${{ github.token }}' } }],
          },
        },
      }),
    ).toEqual([])
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: { update: { steps: [{ run: 'npx --yes skills update' }] } },
      }),
    ).toEqual(['fixture#update step 0: skills update needs GH_TOKEN'])
  })

  it('pins artifact downloads to an explicit token, repository, and run id', () => {
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: {
          test: {
            steps: [
              {
                uses: './.github/actions/download-artifact',
                with: {
                  'github-token': '${{ github.token }}',
                  repository: '${{ github.repository }}',
                  'run-id': '${{ github.run_id }}',
                },
              },
            ],
          },
        },
      }),
    ).toEqual([])
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: { test: { steps: [{ uses: './.github/actions/download-artifact' }] } },
      }),
    ).toEqual([
      'fixture#test step 0: download-artifact must set github-token',
      'fixture#test step 0: download-artifact must set repository',
      'fixture#test step 0: download-artifact must set run-id',
    ])
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: { test: { steps: [{ uses: 'actions/download-artifact@synthetic' }] } },
      }),
    ).toEqual([
      'fixture#test step 0: use ./.github/actions/download-artifact; the upstream action stays alive after success (#5453)',
    ])
    expect(
      workflowSafetyViolations('.github/workflows/ci-upload-codecov.yml', '', {
        jobs: { test: { steps: [{ uses: 'actions/download-artifact@synthetic' }] } },
      }),
    ).toEqual([])
  })

  it('keeps startup settings repository-owned while allowing the null BASH_ENV', () => {
    expect(workflowSafetyViolations('fixture.yml', '  BASH_ENV: /dev/null', {})).toEqual([])
    expect(
      workflowSafetyViolations(
        'fixture.yml',
        `  BASH_ENV: startup.sh
  NODE_OPTIONS: --disable-warning=DEP0205
  run: load-runner-env
  workers: \${{ vars.VITEST_MAX_WORKERS }}
  browsers: \${{ vars.PLAYWRIGHT_MAX_WORKERS }}`,
        {},
      ),
    ).toEqual([
      'fixture.yml: BASH_ENV must be /dev/null',
      'fixture.yml: forbidden workflow startup setting NODE_OPTIONS: --disable-warning=DEP0205',
      'fixture.yml: forbidden workflow startup setting load-runner-env',
      'fixture.yml: forbidden workflow startup setting vars.VITEST_MAX_WORKERS',
      'fixture.yml: forbidden workflow startup setting vars.PLAYWRIGHT_MAX_WORKERS',
    ])
  })
})
