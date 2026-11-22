import {
  WORKFLOW,
  actionStepBlocks,
  cachePathViolations,
  type YamlSources,
} from './workflow-cache-pnpm-parsing.mts'

/** Source-text cache keys and setup-node inputs across tracked YAML. */
export function workflowCachePnpmSourceViolations(sources: YamlSources): string[] {
  const violations: string[] = []
  let workflowSetupNodeCallSites = 0
  const lockfileHashKeyRe = /\$\{\{\s*steps\.[\w-]+\.outputs\.lockfile-hash\s*\}\}/
  const lockfileHashComputeRe = /lockfile-hash=\$\(\s*(?:sha256sum|shasum -a 256)\s+pnpm-lock\.yaml/
  for (const [path, source] of sources) {
    violations.push(...cachePathViolations(source, path))
    const setupNodeBlocks = actionStepBlocks(source, /uses:\s+actions\/setup-node@/)
    if (path.startsWith(WORKFLOW)) workflowSetupNodeCallSites += setupNodeBlocks.length
    if (/^\s+cache:\s*['"]?(?:npm|pnpm|yarn)['"]?/m.test(source) || source.includes('pnpm-cache:'))
      violations.push(`${path}: package manager cache is prohibited`)
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
    // no-mistakes github-actions-action-input-policy owns the setup-node inputs (.nvmrc, no
    // node-version, no cache, package-manager-cache: false).
    for (const block of setupNodeBlocks) {
      const tagged = /uses:\s+actions\/setup-node@v(\d+)/.exec(block)?.[1]
      const pinned = /uses:\s+actions\/setup-node@[0-9a-f]{40}\s+#\s+v(\d+)/.exec(block)?.[1]
      if (Number(tagged ?? pinned ?? -1) < 6)
        violations.push(`${path}: setup-node must be v6 or higher`)
    }
  }
  if (workflowSetupNodeCallSites === 0)
    violations.push('Expected at least one actions/setup-node workflow call site')
  return violations
}
