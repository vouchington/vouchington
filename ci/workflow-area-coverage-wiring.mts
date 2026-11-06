import { isDeepStrictEqual } from 'node:util'
import picomatch from 'picomatch'
import {
  areaCoverageWorkflow,
  calledWorkflow,
  clausesOf,
  codecovWorkflow,
  fullLcovArtifacts,
  needsOf,
  patternMatchesOnce,
  resultGateAction,
  uploadsOf,
  type Documents,
  type Job,
  type Upload,
} from './workflow-area-coverage-model.mts'

export function areaWiringViolations(documents: Documents): string[] {
  const areas = Object.entries(documents).flatMap(([path, document]) =>
    Object.values(document.jobs ?? {}).some(job => job.uses === areaCoverageWorkflow)
      ? [
          {
            area: path.replace(/^\.github\/workflows\//, '').replace(/\.yml$/, ''),
            jobs: document.jobs ?? {},
          },
        ]
      : [],
  )
  const violations: string[] = []
  const check = (valid: boolean, label: string): void => {
    if (!valid) violations.push(label)
  }
  check(
    isDeepStrictEqual(areas.map(({ area }) => area).toSorted(), [
      'backend',
      'cloudflare-worker',
      'lambdas',
      'tooling',
      'web',
    ]),
    'areas: discover exactly backend, cloudflare-worker, lambdas, tooling, web',
  )
  const allUploads: Upload[] = []
  const allArtifacts: string[] = []
  for (const { area, jobs } of areas) {
    const coverageCalls = Object.entries(jobs).filter(
      ([, job]) => job.uses === areaCoverageWorkflow,
    )
    const codecovCalls = Object.entries(jobs).filter(([, job]) => job.uses === codecovWorkflow)
    check(coverageCalls.length === 1, `${area}: exactly one area coverage caller`)
    check(codecovCalls.length === 1, `${area}: exactly one Codecov caller`)
    if (coverageCalls.length !== 1 || codecovCalls.length !== 1) continue
    const [coverageId, coverage] = coverageCalls[0]!
    const [codecovId, codecov] = codecovCalls[0]!
    const producers = Object.entries(jobs).filter(
      ([, job]) => fullLcovArtifacts(calledWorkflow(documents, job)).length > 0,
    )
    const producerIds = producers.map(([id]) => id)
    check(producers.length > 0, `${area}: at least one LCOV producer`)
    check(isDeepStrictEqual(coverage.with, { area }), `${area}: coverage inputs equal its area`)
    check(
      producers.every(([, job]) => job.with?.publish_coverage === true),
      `${area}: every producer publishes coverage`,
    )
    check(
      producerIds.every(id => needsOf(coverage).includes(id)),
      `${area}: coverage needs every producer`,
    )
    check(
      [...producerIds, ...(area === 'tooling' ? ['changes'] : [])].every(id =>
        needsOf(codecov).includes(id),
      ),
      `${area}: Codecov needs every producer and selection`,
    )
    let uploads: Upload[]
    try {
      uploads = uploadsOf(codecov)
    } catch {
      violations.push(`${area}: Codecov uploads must be JSON`)
      continue
    }
    const artifacts = producers.flatMap(([, job]) =>
      fullLcovArtifacts(calledWorkflow(documents, job)),
    )
    check(
      patternMatchesOnce(artifacts, uploads),
      `${area}: each LCOV artifact matches exactly one upload`,
    )
    check(
      uploads.every(upload =>
        artifacts.some(artifact => picomatch.isMatch(artifact, upload.pattern)),
      ),
      `${area}: every upload pattern matches an artifact`,
    )
    const gates = Object.entries(jobs).filter(([, job]) =>
      job.steps?.some(step => step.uses?.startsWith(resultGateAction)),
    )
    check(
      isDeepStrictEqual(
        gates.map(([id]) => id),
        [area],
      ),
      `${area}: exactly its required result gate`,
    )
    const gate = gates[0]?.[1] ?? {}
    check(needsOf(gate).includes(coverageId), `${area}: required gate needs patch coverage`)
    check(
      !needsOf(gate).includes(codecovId),
      `${area}: required gate does not need informational Codecov`,
    )
    check(codecov.permissions?.['id-token'] === 'write', `${area}: Codecov gets OIDC`)
    check(
      !codecov.if?.includes('trusted-secret-context'),
      `${area}: Codecov remains eligible for forks`,
    )
    check(
      !Object.hasOwn(coverage.permissions ?? {}, 'id-token'),
      `${area}: patch coverage has no OIDC`,
    )
    if (area === 'tooling')
      check(
        clausesOf(codecov.if).includes("needs.changes.outputs.area-tooling == 'true'"),
        'tooling: skip uploads when only bounds runs',
      )
    if (area === 'backend' || area === 'web')
      checkProducerSuccess(area, codecov, producerIds, check)
    check(
      ['!cancelled()', "github.event_name == 'pull_request'"].every(clause =>
        clausesOf(coverage.if).includes(clause),
      ),
      `${area}: patch coverage runs on uncancelled pull requests`,
    )
    check(!coverage.if?.includes('merge_group'), `${area}: patch coverage excludes merge groups`)
    check(
      !codecov.if?.includes('github.event_name'),
      `${area}: uploads are independent of event name`,
    )
    allUploads.push(...uploads)
    allArtifacts.push(
      ...Object.values(jobs).flatMap(job => fullLcovArtifacts(calledWorkflow(documents, job))),
    )
  }
  const flags = allUploads.map(upload => upload.flag)
  check(new Set(flags).size === flags.length, 'uploads: flags are globally unique')
  check(
    flags.every(flag => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(flag)),
    'uploads: flags use lowercase hyphenated names',
  )
  check(
    patternMatchesOnce(allArtifacts, allUploads),
    'uploads: artifacts match exactly one pattern across areas',
  )
  return violations
}

function checkProducerSuccess(
  area: string,
  codecov: Job,
  producerIds: string[],
  check: (valid: boolean, label: string) => void,
): void {
  const successClause = clausesOf(codecov.if).find(clause => clause.includes(' || ')) ?? ''
  const actualProducers = [...successClause.matchAll(/needs\.([\w-]+)\.result == 'success'/gu)].map(
    ([, id]) => id,
  )
  check(
    !codecov.if?.includes("contains(needs.*.result, 'success')"),
    `${area}: no wildcard needs success`,
  )
  check(
    isDeepStrictEqual(actualProducers.toSorted(), producerIds.toSorted()),
    `${area}: Codecov success clause names exactly the LCOV producers`,
  )
}
