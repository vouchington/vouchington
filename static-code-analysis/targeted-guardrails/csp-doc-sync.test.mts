import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { CSP_DOC_FILE, CSP_SOURCE_FILE, checkCspDocSync } from './csp-doc-sync.mts'
import { checkTargetedGuardrails } from './index.mts'

const SYNCED_SOURCE = `const GTM_ORIGIN = 'https://g.voucha.ai'
const IMAGE_DELIVERY_ORIGINS = ['https://images.example']

export const buildWebCsp = () => {
  return [
    "default-src 'self'",
    // Production omits the non-production script allowance.
    \`script-src 'self'\${devEval} \${GTM_ORIGIN}\${asset}\`,
    \`img-src 'self' data: blob: https: \${IMAGE_DELIVERY_ORIGINS.join(' ')}\`,
    \`connect-src 'self' \${sentry}\${GTM_ORIGIN} \${browserUploadOrigins.join(' ')}\${asset}\`,
  ].join('; ')
}
`

const SYNCED_DOC = `# Content Security Policy

\`\`\`txt
default-src 'self';
script-src 'self' https://g.voucha.ai {CSP_ASSET_ORIGIN};
img-src 'self' data: blob: https: https://images.example;
connect-src 'self' {CSP_SENTRY_ORIGIN} https://g.voucha.ai {CSP_BROWSER_UPLOAD_ORIGINS} {CSP_ASSET_ORIGIN}
\`\`\`
`

describe('CSP reference doc sync guard', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('accepts the production schematic, including empty non-production slots', () => {
    expect(checkCspDocSync({ sourceCode: SYNCED_SOURCE, docMarkdown: SYNCED_DOC })).toEqual([])
  })

  it('flags a documented directive that dropped a production source token', () => {
    const errors = checkCspDocSync({
      sourceCode: SYNCED_SOURCE,
      docMarkdown: SYNCED_DOC.replace(' data: blob:', ' data:'),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('differs from buildWebCsp')
    expect(errors[0]).toContain('`img-src`')
    expect(errors[0]).toContain('blob:')
  })

  it('flags a documented directive that still names a removed origin', () => {
    const errors = checkCspDocSync({
      sourceCode: SYNCED_SOURCE,
      docMarkdown: SYNCED_DOC.replace(
        'https://g.voucha.ai {CSP_ASSET_ORIGIN}',
        'https://g.voucha.ai https://stale.example {CSP_ASSET_ORIGIN}',
      ),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('https://stale.example')
  })

  it('flags a reference that requires the non-production unsafe-eval allowance', () => {
    const errors = checkCspDocSync({
      sourceCode: SYNCED_SOURCE,
      docMarkdown: SYNCED_DOC.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("'unsafe-eval'")
  })

  it('rejects source that does not expose a buildWebCsp return array', () => {
    const errors = checkCspDocSync({
      sourceCode: "export const buildWebCsp = () => 'default-src self'",
      docMarkdown: SYNCED_DOC,
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not render the production buildWebCsp policy')
  })

  it('rejects an unknown directive interpolation', () => {
    const errors = checkCspDocSync({
      sourceCode: SYNCED_SOURCE.replace('${GTM_ORIGIN}', '${UNKNOWN_ORIGIN}'),
      docMarkdown: SYNCED_DOC,
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not render the production buildWebCsp policy')
  })

  it('rejects a reference without a txt CSP fence', () => {
    const errors = checkCspDocSync({
      sourceCode: SYNCED_SOURCE,
      docMarkdown: '# Content Security Policy\n\nNo fence.\n',
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not parse the production CSP reference')
  })

  it('keeps the tracked production CSP reference in sync with current source', async () => {
    const repoRoot = join(import.meta.dirname, '../..')
    const [sourceCode, docMarkdown] = await Promise.all([
      readFile(join(repoRoot, CSP_SOURCE_FILE), 'utf8'),
      readFile(join(repoRoot, CSP_DOC_FILE), 'utf8'),
    ])

    expect(checkCspDocSync({ sourceCode, docMarkdown })).toEqual([])
  })

  it('checks a tracked reference against the source file on disk', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-csp-doc-sync-'))
    testDirs.push(repoRoot)
    await mkdir(join(repoRoot, 'cloudflare-worker/src'), { recursive: true })
    await mkdir(join(repoRoot, 'docs/requirements/security'), { recursive: true })
    await writeFile(join(repoRoot, CSP_SOURCE_FILE), SYNCED_SOURCE)
    await writeFile(join(repoRoot, CSP_DOC_FILE), SYNCED_DOC.replace(' blob:', ''))

    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles: [CSP_SOURCE_FILE, CSP_DOC_FILE],
      trackedFileSet: new Set([CSP_SOURCE_FILE, CSP_DOC_FILE]),
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('`img-src`')
  })

  it('reports a missing reference path when CSP source remains tracked', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-csp-doc-sync-'))
    testDirs.push(repoRoot)
    await mkdir(join(repoRoot, 'cloudflare-worker/src'), { recursive: true })
    await writeFile(join(repoRoot, CSP_SOURCE_FILE), SYNCED_SOURCE)

    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles: [CSP_SOURCE_FILE, CSP_DOC_FILE],
      trackedFileSet: new Set([CSP_SOURCE_FILE, CSP_DOC_FILE]),
    })

    expect(result.errors).toEqual([
      `::error file=${CSP_SOURCE_FILE}::${CSP_SOURCE_FILE}: CSP doc-sync guard expects ${CSP_DOC_FILE} to exist; if you renamed one of the two, update the guard path constants together`,
    ])
  })

  it('does not let an untracked reference satisfy tracked CSP source', () => {
    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot: '/tmp/example',
      trackedFiles: [CSP_SOURCE_FILE],
      trackedFileSet: new Set([CSP_SOURCE_FILE]),
    })

    expect(result.errors).toEqual([
      `::error file=${CSP_SOURCE_FILE}::${CSP_SOURCE_FILE}: CSP doc-sync guard expects ${CSP_DOC_FILE} to also be tracked; if you renamed one of the two, update the guard path constants together`,
    ])
  })

  it('does not let untracked CSP source satisfy a tracked reference', () => {
    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot: '/tmp/example',
      trackedFiles: [CSP_DOC_FILE],
      trackedFileSet: new Set([CSP_DOC_FILE]),
    })

    expect(result.errors).toEqual([
      `::error file=${CSP_DOC_FILE}::${CSP_DOC_FILE}: CSP doc-sync guard expects ${CSP_SOURCE_FILE} to also be tracked; if you renamed one of the two, update the guard path constants together`,
    ])
  })
})
