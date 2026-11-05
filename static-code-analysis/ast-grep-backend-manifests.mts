import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempDisposableSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ruleYamlWithoutExamples } from './ast-grep-rule-yaml.mts'

export const backendManifestRuleId = 'backend-knip-test-export-exclusions'
const rulePath = fileURLToPath(
  new URL('../ast-grep-rules/backend-knip-test-export-exclusions.yml', import.meta.url),
)

export function getTrackedBackendPackageManifests(root: string): string[] {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--', 'backend/package.json', 'backend/**/package.json'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(path => path && statSync(join(root, path), { throwIfNoEntry: false })?.isFile())
}

export function scanTrackedBackendPackageManifests(root = process.cwd()): number {
  const manifests = getTrackedBackendPackageManifests(root)
  // ast-grep defaults to scanning '.' when no explicit path is supplied.
  if (manifests.length === 0) return 0
  using directory = mkdtempDisposableSync(join(tmpdir(), 'ast-grep-manifest-rule-'))
  const rule = join(directory.path, 'rule.yml')
  writeFileSync(rule, ruleYamlWithoutExamples(readFileSync(rulePath, 'utf8')))
  return (
    spawnSync('ast-grep', ['scan', '--no-ignore', 'hidden', '--rule', rule, ...manifests], {
      cwd: root,
      stdio: 'inherit',
    }).status ?? 1
  )
}
