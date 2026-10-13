import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { checkFormKeyboardReference } from './form-keyboard-reference-guard.mts'

const DOCUMENT = 'docs/requirements/navigation/reference-components-patterns.md'
const HELPER = 'web/test-helpers/form-keyboard.ts'
const REFERENCE = `Spec: ${DOCUMENT}#form-keyboard-behavior`

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'form-keyboard-reference-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, timeout: 5_000 })
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  git('init', '--quiet', '--initial-branch=fixture-branch')
  write(HELPER, `// ${REFERENCE}\n`)
  write(DOCUMENT, '### Form Keyboard Behavior\n')
  git('add', '.')
  return { root, git, write }
}

describe('form keyboard canonical reference', () => {
  it('keeps the form keyboard helper pointed at the canonical pattern reference', () => {
    const { root } = fixture()
    expect(() => checkFormKeyboardReference(root)).not.toThrow()
  })

  it('rejects an obsolete tracked reference even when its working copy was corrected', () => {
    const { root, git, write } = fixture()
    const obsolete = ['docs/requirements/navigation/', 'COMPONENTS.md#form-keyboard-behavior'].join(
      '',
    )
    write('docs/obsolete.md', obsolete)
    git('add', 'docs/obsolete.md')
    write('docs/obsolete.md', REFERENCE)
    expect(() => checkFormKeyboardReference(root)).toThrow(
      'Obsolete reference remains in tracked blobs',
    )
  })

  it('ignores untracked obsolete references', () => {
    const { root, write } = fixture()
    write(
      'untracked.md',
      ['docs/requirements/navigation/', 'COMPONENTS.md#form-keyboard-behavior'].join(''),
    )
    expect(() => checkFormKeyboardReference(root)).not.toThrow()
  })

  it('rejects a missing canonical helper reference', () => {
    const { root, git, write } = fixture()
    write(HELPER, '// Missing reference\n')
    git('add', HELPER)
    expect(() => checkFormKeyboardReference(root)).toThrow('Form keyboard helper must reference')
  })

  it('rejects a missing canonical heading', () => {
    const { root, git, write } = fixture()
    write(DOCUMENT, '### Another Pattern\n')
    git('add', DOCUMENT)
    expect(() => checkFormKeyboardReference(root)).toThrow(
      'Canonical form keyboard behavior heading is missing',
    )
  })
})
