import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { residualProductCopy } from './email-copy-registry-policy.mts'

/** Inspect the checked-out templates only in static CI; unit tests supply source fixtures. */
export function checkEmailCopyRegistry(root: string): string[] {
  const directory = join(root, 'email-templates')
  const sources = readdirSync(join(root, 'email-templates'), {
    encoding: 'utf8',
    recursive: true,
  }).flatMap(path => {
    if ((!path.endsWith('.mts') && !path.endsWith('.tsx')) || path.includes('.test.')) return []
    return [{ path, text: readFileSync(join(directory, path), 'utf8') }]
  })
  const violations = residualProductCopy(sources).map(
    path => `${path}: residual email product copy`,
  )
  for (const removedPath of ['ts-shared/ui-messages/messages', 'dev/localization/import.mts']) {
    if (existsSync(join(root, removedPath)))
      violations.push(`${removedPath}: replaced copy path exists`)
  }
  return violations
}

if (import.meta.main) {
  const violations = checkEmailCopyRegistry(process.cwd())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
