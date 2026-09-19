export type ClosureScanIssue = {
  file: string
  reason: string
}

const ALIAS_BODY = '(?:extracted|common|nav|settings|shared)\\.(?:[A-Za-z0-9_]+\\.)*[A-Za-z0-9_]+'
const QUOTED_ALIAS_RE = new RegExp(`['"\`](${ALIAS_BODY})['"\`]`, 'g')
const UNBOUNDED_KEY_RE = /\bt\(\s*(?:`[^`]*\$\{|(?:['"][^'"]*['"]|[_$A-Za-z][\w$.]*)\s*\+)/
const COMPUTED_IMPORT_RE = /import\s*\(\s*(?:`[^`]*\$\{|[_$A-Za-z])/

function withoutFullLineComments(text: string): string {
  return text.replace(/^[ \t]*\/\/.*$/gm, '')
}

export function quotedAliasesFromText(text: string): Set<string> {
  const aliases = new Set<string>()
  for (const match of text.matchAll(QUOTED_ALIAS_RE)) {
    const alias = match[1]
    if (alias) aliases.add(alias)
  }
  return aliases
}

export function unboundedTranslationKeyHit(text: string): boolean {
  return UNBOUNDED_KEY_RE.test(withoutFullLineComments(text))
}

export function computedDynamicImportHit(text: string): boolean {
  return COMPUTED_IMPORT_RE.test(withoutFullLineComments(text))
}

export function messageKeyCastHit(text: string): boolean {
  return /\bas MessageKey\b/.test(withoutFullLineComments(text))
}

export function isProductionWebSource(relativePath: string): boolean {
  if (!relativePath.startsWith('web/')) return false
  if (/\.(?:test|spec|stories)\./.test(relativePath)) return false
  if (relativePath.includes('/__tests__/')) return false
  if (relativePath.includes('/test-helpers/')) return false
  return true
}

export function closureIssuesForFile(relativePath: string, text: string): ClosureScanIssue[] {
  const issues: ClosureScanIssue[] = []
  if (unboundedTranslationKeyHit(text)) {
    issues.push({ file: relativePath, reason: 'unbounded translation key' })
  }
  if (computedDynamicImportHit(text)) {
    issues.push({ file: relativePath, reason: 'computed dynamic import' })
  }
  if (isProductionWebSource(relativePath) && messageKeyCastHit(text)) {
    issues.push({ file: relativePath, reason: 'production MessageKey cast' })
  }
  return issues
}

export function formatClosureScanFailure(issues: readonly ClosureScanIssue[]): string {
  return `Route i18n scan failed:\n${issues.map(issue => `${issue.file}: ${issue.reason}`).join('\n')}`
}

export function uniqueClosureScanIssues(issues: readonly ClosureScanIssue[]): ClosureScanIssue[] {
  const seen = new Set<string>()
  const unique: ClosureScanIssue[] = []
  for (const issue of issues) {
    const key = `${issue.file}\0${issue.reason}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(issue)
  }
  return unique
}
