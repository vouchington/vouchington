import { spawnSync } from 'node:child_process'

const OBSOLETE_REFERENCE = [
  'docs/requirements/navigation/',
  'COMPONENTS.md#form-keyboard-behavior',
].join('')
const CANONICAL_DOCUMENT = 'docs/requirements/navigation/reference-components-patterns.md'

export function checkFormKeyboardReference(root: string): void {
  const options = { cwd: root, encoding: 'utf8' as const, timeout: 10_000, maxBuffer: 1024 * 1024 }
  const obsolete = spawnSync(
    'git',
    ['grep', '--cached', '-F', '-n', '--', OBSOLETE_REFERENCE],
    options,
  )
  if (obsolete.error) throw obsolete.error
  if (obsolete.status === 0)
    throw new Error(`Obsolete reference remains in tracked blobs:\n${obsolete.stdout}`)
  if (obsolete.status !== 1) throw new Error(`Git reference audit failed: ${obsolete.stderr}`)
  const readTracked = (path: string): string => {
    const result = spawnSync('git', ['show', `:${path}`], options)
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Cannot read tracked ${path}: ${result.stderr}`)
    return result.stdout
  }
  if (
    !readTracked('web/test-helpers/form-keyboard.ts').includes(
      `Spec: ${CANONICAL_DOCUMENT}#form-keyboard-behavior`,
    )
  )
    throw new Error('Form keyboard helper must reference the canonical pattern')
  if (!/^### Form Keyboard Behavior$/m.test(readTracked(CANONICAL_DOCUMENT)))
    throw new Error('Canonical form keyboard behavior heading is missing')
}
