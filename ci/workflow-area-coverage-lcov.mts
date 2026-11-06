import { isDeepStrictEqual } from 'node:util'
import {
  areaCoverageWorkflow,
  fullLcovUploads,
  stepsOf,
  type Documents,
} from './workflow-area-coverage-model.mts'

/** Preserve the upload/finalizer protocol independently of the PR-only coverage job. */
export function areaLcovViolations(documents: Documents): string[] {
  const areas = Object.values(documents).filter(document =>
    Object.values(document.jobs ?? {}).some(job => job.uses === areaCoverageWorkflow),
  )
  const reusables = [
    ...new Set(
      areas.flatMap(document =>
        Object.values(document.jobs ?? {}).flatMap(job => (job.uses ? [job.uses.slice(2)] : [])),
      ),
    ),
  ].filter(path => fullLcovUploads(documents[path]).length > 0)
  const violations: string[] = []
  const check = (valid: boolean, label: string): void => {
    if (!valid) violations.push(label)
  }
  check(reusables.length > 0, 'LCOV: at least one reusable producer')
  for (const path of reusables) {
    const uploads = fullLcovUploads(documents[path])
    for (const upload of uploads) {
      const condition = upload.if ?? ''
      check(
        /^\$\{\{ inputs\.publish_coverage[ }]/.test(condition),
        `${path}: LCOV upload starts with publish_coverage`,
      )
      check(
        isDeepStrictEqual(
          upload.with?.['name-suffix'],
          condition.includes(".outcome == 'failure'") ? '-retry' : undefined,
        ),
        `${path}: LCOV retry suffix matches its condition`,
      )
      check(
        !/coverage-stamp|publish_coverage_pair|cancelled/.test(condition),
        `${path}: LCOV upload is independent of coverage and cancellation`,
      )
    }
    for (const suite of new Set(uploads.map(upload => upload.with?.suite))) {
      const outcome = stepsOf(documents[path]).find(
        step => step.env?.FAMILY === 'full-lcov' && step.env?.SUITE === suite,
      )
      check(
        outcome?.if === '${{ inputs.publish_coverage }}',
        `${path}: LCOV finalizer uses publish_coverage for ${String(suite)}`,
      )
    }
  }
  return violations
}

/** Keep credentialed informational uploads separate from the blocking coverage checker. */
export function areaCoverageReusableViolations(
  sources: Readonly<Record<string, string>>,
  documents: Documents,
): string[] {
  const violations: string[] = []
  const check = (valid: boolean, label: string): void => {
    if (!valid) violations.push(label)
  }
  const coveragePath = '.github/workflows/ci-area-coverage.yml'
  const coverage = documents[coveragePath]?.jobs?.coverage
  check(
    isDeepStrictEqual(coverage?.permissions, { actions: 'read', contents: 'read' }),
    'coverage reusable: exact read-only permissions',
  )
  check(
    coverage?.steps?.at(-1)?.run?.includes('./ci/coverage-artifacts.sh area-check') === true,
    'coverage reusable: final step checks area artifacts',
  )
  check(!sources[coveragePath]?.includes('CODECOV_TOKEN'), 'coverage reusable: no Codecov token')
  const codecovPath = '.github/workflows/ci-upload-codecov.yml'
  const codecov = documents[codecovPath]?.jobs?.['upload-codecov']
  const upload = codecov?.steps?.find(step => step.uses?.startsWith('codecov/codecov-action@'))
  check(codecov?.permissions?.['id-token'] === 'write', 'Codecov reusable: OIDC permission')
  check(codecov?.['continue-on-error'] === true, 'Codecov reusable: upload is informational')
  check(
    /^codecov\/codecov-action@[0-9a-f]{40}$/.test(upload?.uses ?? ''),
    'Codecov reusable: pinned upload action',
  )
  check(
    upload?.with?.flags === '${{ matrix.flag }}' && upload.with.use_oidc === true,
    'Codecov reusable: per-suite flags and OIDC',
  )
  check(
    codecov?.steps !== undefined && !codecov.steps.some(step => step.run !== undefined),
    'Codecov reusable: no shell steps',
  )
  check(
    sources[codecovPath]?.includes('persist-credentials: false'),
    'Codecov reusable: checkout credentials disabled',
  )
  check(
    !sources[codecovPath]?.includes('./.github/actions/'),
    'Codecov reusable: no local composite action',
  )
  check(!sources[codecovPath]?.includes('CODECOV_TOKEN'), 'Codecov reusable: no Codecov token')
  return violations
}
