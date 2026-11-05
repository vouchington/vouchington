import {
  ACTION,
  SCRIPT_FREE,
  WORKFLOW,
  actionStepBlocks,
  cachePathViolations,
  hasCredential,
  inlineLocalComposites,
  isActionsCacheStep,
  normalizedCachePaths,
  parsed,
  runsPnpmInstall,
  setupCall,
  setupNodePnpm,
  stepLists,
  type YamlSources,
} from './workflow-cache-pnpm-parsing.mts'

export { cachePathsAreAllowed, runsPnpmInstall } from './workflow-cache-pnpm-parsing.mts'

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
  const lockfileHashKeyRe = /\$\{\{\s*steps\.[\w-]+\.outputs\.lockfile-hash\s*\}\}/
  const lockfileHashComputeRe = /lockfile-hash=\$\(\s*(?:sha256sum|shasum -a 256)\s+pnpm-lock\.yaml/
  for (const [path, source] of sources) {
    violations.push(...cachePathViolations(source, path))
    if (/^\s+cache:\s*['"]?(?:npm|pnpm|yarn)['"]?/m.test(source) || source.includes('pnpm-cache:'))
      violations.push(`${path}: package manager cache is prohibited`)
    if (
      actionStepBlocks(source, /uses:\s+actions\/setup-node@/).some(block =>
        /^\s+cache:/m.test(block),
      )
    )
      violations.push(`${path}: setup-node cache input is prohibited`)
    for (const block of actionStepBlocks(source, /uses:\s+actions\/cache(?:\/restore|\/save)?@/)) {
      if (!block.includes('ms-playwright')) continue
      const firstLine = block.trim().split('\n')[0]
      if (!lockfileHashKeyRe.test(block))
        violations.push(`${path}: "${firstLine}" must key on steps.*.outputs.lockfile-hash.`)
      else if (!lockfileHashComputeRe.test(source))
        violations.push(`${path}: "${firstLine}" keys on lockfile-hash but no step computes it.`)
      if (!block.includes('runner.os') || !block.includes('runner.arch'))
        violations.push(`${path}: "${firstLine}" must scope its key by runner.os/runner.arch.`)
      if (block.includes('restore-keys:'))
        violations.push(`${path}: Playwright cache "${firstLine}" must not declare restore-keys.`)
    }
    for (const block of actionStepBlocks(source, /uses:\s+actions\/setup-node@/)) {
      const tagged = /uses:\s+actions\/setup-node@v(\d+)/.exec(block)?.[1]
      const pinned = /uses:\s+actions\/setup-node@[0-9a-f]{40}\s+#\s+v(\d+)/.exec(block)?.[1]
      if (Number(tagged ?? pinned ?? -1) < 6)
        violations.push(`${path}: setup-node must be v6 or higher`)
      if (!block.includes("node-version-file: '.nvmrc'"))
        violations.push(`${path}: setup-node must read .nvmrc`)
      if (/node-version-file:\s*['"]?(?:\$\{\{|\/)/u.test(block))
        violations.push(`${path}: unsafe node-version-file`)
      if (/^\s+node-version:/m.test(block)) violations.push(`${path}: hardcoded Node version`)
      if (!block.includes('package-manager-cache: false'))
        violations.push(`${path}: setup-node must disable package manager cache`)
    }
  }
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
  for (const { owner, step } of setupSteps) {
    for (const input of Object.keys(step.with ?? {}))
      if (!setupNodePnpm(step) || !['deadline-seconds', 'install-scripts'].includes(input))
        violations.push(`${owner}: unexpected setup input ${input}`)
    if (setupNodePnpm(step)) {
      const timeout = step['timeout-minutes']
      const cap = typeof timeout === 'number' ? timeout : undefined
      const rawDeadline = step.with?.['deadline-seconds']
      const deadline = rawDeadline === undefined ? undefined : Number(rawDeadline)
      if (
        cap !== undefined && cap <= 5
          ? !(
              deadline !== undefined &&
              Number.isInteger(deadline) &&
              deadline > 0 &&
              deadline < cap * 60
            )
          : deadline !== undefined
      )
        violations.push(`${owner}: deadline is not below the step cap`)
    }
    if (step.with && 'install-scripts' in step.with && step.with['install-scripts'] !== 'false')
      violations.push(`${owner}: install-scripts must be false`)
    if (step.with?.['install-scripts'] === 'false') scriptFree.push(owner)
  }
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
              normalizedCachePaths(prior.with?.path)?.some(path => path.includes('ms-playwright')),
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
