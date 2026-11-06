import { setupStepViolations } from './workflow-cache-pnpm-setup-policy.mts'
import { workflowCachePnpmSourceViolations } from './workflow-cache-pnpm-source-policy.mts'
import {
  ACTION,
  SCRIPT_FREE,
  WORKFLOW,
  hasCredential,
  inlineLocalComposites,
  isActionsCacheStep,
  normalizedCachePaths,
  parsed,
  runsPnpmInstall,
  setupCall,
  stepLists,
  type YamlSources,
} from './workflow-cache-pnpm-parsing.mts'

/** Pure policy evaluation. The static runner owns repository reads. */
export function workflowCachePnpmViolations(sources: YamlSources): string[] {
  const violations: string[] = []
  const lists = stepLists(sources)
  const workflowPaths = [...sources.keys()].filter(path => path.startsWith(WORKFLOW)).toSorted()
  const setupSteps = lists.flatMap(({ owner, steps }) =>
    steps.flatMap(step => (setupCall(step) ? [{ owner, step }] : [])),
  )
  const directInstalls: string[] = []
  const scriptFree: string[] = []
  let dockerBuildSteps = 0
  violations.push(...workflowCachePnpmSourceViolations(sources))
  for (const { owner, steps } of lists) {
    for (const step of steps) {
      const command = step.with?.command
      if ([step.run, typeof command === 'string' ? command : undefined].some(runsPnpmInstall))
        directInstalls.push(owner)
      if (
        /^docker\/(?:bake|build-push)-action@/.test(step.uses ?? '') &&
        step.env?.BUILDX_METADATA_PROVENANCE !== 'disabled'
      )
        violations.push(`${owner}: Docker build metadata provenance must be disabled`)
      if (/^docker\/(?:bake|build-push)-action@/.test(step.uses ?? '')) dockerBuildSteps++
    }
  }
  if (dockerBuildSteps < 3) violations.push('Expected at least three Docker build actions')
  if (!setupSteps.some(({ owner }) => owner.startsWith(ACTION)))
    violations.push('Expected setup-node-pnpm in a composite action')
  if (directInstalls.join('|') !== `${WORKFLOW}postgresql-snapshot-update.yml#generate`)
    violations.push(
      `pnpm install must be owned by setup-node-pnpm; direct sites: ${directInstalls.join(', ')}`,
    )
  const setupResult = setupStepViolations(setupSteps)
  violations.push(...setupResult.violations)
  scriptFree.push(...setupResult.scriptFree)
  for (const path of workflowPaths) {
    const host = parsed(sources, path)
    for (const [jobId, job] of Object.entries(host.jobs ?? {})) {
      const steps = job.steps ?? []
      for (const [index, step] of steps.entries()) {
        if (!setupCall(step)) continue
        if (JSON.stringify(job.env ?? {}).includes('secrets.'))
          violations.push(`${path}#${jobId}: job-level secret environment`)
        const firstCredential = steps.findIndex(hasCredential)
        if (firstCredential !== -1 && index >= firstCredential)
          violations.push(`${path}#${jobId}: setup after credentials`)
      }
      const expanded = inlineLocalComposites(sources, steps)
      expanded.forEach((step, index) => {
        if (!(step.run ?? '').includes('playwright install')) return
        const hasCache = expanded
          .slice(0, index)
          .some(
            prior =>
              isActionsCacheStep(prior) &&
              normalizedCachePaths(prior.with?.path)?.some(cachePath =>
                cachePath.includes('ms-playwright'),
              ),
          )
        if (!hasCache)
          violations.push(
            `${path.split('/').at(-1)}#${jobId}: step "${step.name ?? 'Playwright install'}" installs Playwright browsers without a preceding actions/cache step for ~/.cache/ms-playwright.`,
          )
      })
    }
  }
  if (scriptFree.toSorted().join('|') !== SCRIPT_FREE.toSorted().join('|'))
    violations.push(`Script-free install callers differ: ${scriptFree.toSorted().join(', ')}`)
  const webImages = sources.get(`${ACTION}build-web-images/action.yml`)
  const backendImages = sources.get(`${ACTION}build-backend-images/action.yml`)
  const explain = sources.get(`${WORKFLOW}explain-analyze.yml`)
  if (
    !webImages?.includes("DOCKER_BUILD_RECORD_UPLOAD: 'false'") ||
    !webImages.includes("DOCKER_BUILD_SUMMARY: 'false'")
  )
    violations.push('build-web-images must disable Docker build record and summary')
  if (!backendImages?.includes("DOCKER_BUILD_RECORD_UPLOAD: 'false'"))
    violations.push('build-backend-images must disable Docker build record')
  if (
    !explain?.includes('name: Upload EXPLAIN ANALYZE results') ||
    !explain.includes('if: always()')
  )
    violations.push('explain-analyze must upload results always')
  return violations
}
