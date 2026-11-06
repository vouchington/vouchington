import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { trackedFiles } from './tracked-files.mts'
import { vitestReporterPolicyViolations } from './vitest-reporter-policy.mts'

export function checkVitestReporterPolicy(root: string): string[] {
  const files = trackedFiles(root, ['.github/workflows']).filter(file =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(file),
  )
  return vitestReporterPolicyViolations(
    Object.fromEntries(files.map(file => [file, readFileSync(resolve(root, file), 'utf8')])),
  )
}
