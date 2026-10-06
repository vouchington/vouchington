export const CSP_SOURCE_FILE = 'cloudflare-worker/src/csp.mts'
export const CSP_DOC_FILE =
  'docs/requirements/security/reference-content-security-policy-cf-worker.md'

const BUILD_WEB_CSP = 'export const buildWebCsp'
const RETURN_START = 'return ['
const RETURN_JOIN = "].join('; ')"

// Production schematic of the runtime slots. devEval and devImg stay empty so the
// reference documents the production policy, not the non-production allowances.
const RUNTIME_PLACEHOLDERS = new Map<string, string>([
  ['nonce', " 'nonce-{per-request-nonce}'"],
  ['devEval', ''],
  ['devImg', ''],
  ['asset', ' {CSP_ASSET_ORIGIN}'],
  ['sentry', '{CSP_SENTRY_ORIGIN} '],
  ["browserUploadOrigins.join(' ')", '{CSP_BROWSER_UPLOAD_ORIGINS}'],
])

function readStringConsts(source: string): Map<string, string> {
  const consts = new Map<string, string>()
  for (const match of source.matchAll(/^const ([A-Z0-9_]+) = '([^']*)'/gm)) {
    const name = match[1]
    const value = match[2]
    if (name !== undefined && value !== undefined) consts.set(name, value)
  }
  return consts
}

function readBracketBody(source: string, openIndex: number): string | null {
  let depth = 1
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === '[') depth += 1
    else if (char === ']') depth -= 1
    if (depth === 0) return source.slice(openIndex, index)
  }
  return null
}

function stringArrayValues(body: string): string[] | null {
  const values: string[] = []
  let residue = ''
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char !== "'") {
      residue += char ?? ''
      continue
    }
    const end = body.indexOf("'", index + 1)
    if (end < 0) return null
    values.push(body.slice(index + 1, end))
    index = end
  }
  return residue.replace(/[\s,]/g, '') === '' ? values : null
}

function readStringArrays(source: string): Map<string, string[]> | null {
  const arrays = new Map<string, string[]>()
  for (const match of source.matchAll(/const ([A-Z0-9_]+) = \[/g)) {
    const name = match[1]
    const openIndex = (match.index ?? 0) + match[0].length
    if (name === undefined) return null
    const body = readBracketBody(source, openIndex)
    if (body === null) return null
    const values = stringArrayValues(body)
    if (values !== null && values.length > 0) arrays.set(name, values)
  }
  return arrays
}

function skipReturnGap(body: string, index: number): number | null {
  let cursor = index
  while (cursor < body.length && /[\s,]/.test(body[cursor] ?? '')) cursor += 1
  if (!body.startsWith('//', cursor)) return cursor
  const newline = body.indexOf('\n', cursor)
  return newline < 0 ? body.length : skipReturnGap(body, newline + 1)
}

function readReturnTemplates(source: string): string[] | null {
  const functionAt = source.indexOf(BUILD_WEB_CSP)
  if (functionAt < 0) return null
  const returnAt = source.indexOf(RETURN_START, functionAt)
  const joinAt = returnAt < 0 ? -1 : source.indexOf(RETURN_JOIN, returnAt)
  if (returnAt < 0 || joinAt < 0) return null
  const body = source.slice(returnAt + RETURN_START.length, joinAt)
  const templates: string[] = []
  let index = 0
  while (index < body.length) {
    const cursor = skipReturnGap(body, index)
    if (cursor === null || cursor >= body.length) break
    const quote = body[cursor]
    if (quote !== '"' && quote !== '`') return null
    const end = body.indexOf(quote, cursor + 1)
    if (end < 0) return null
    templates.push(body.slice(cursor + 1, end))
    index = end + 1
  }
  return templates.length > 0 ? templates : null
}

function resolveExpression(
  expression: string,
  consts: Map<string, string>,
  arrays: Map<string, string[]>,
): string | null {
  const placeholder = RUNTIME_PLACEHOLDERS.get(expression)
  if (placeholder !== undefined) return placeholder
  const join = /^([A-Z0-9_]+)\.join\(' '\)$/.exec(expression)
  if (!join) return consts.get(expression) ?? null
  const values = arrays.get(join[1] ?? '')
  return values === undefined ? null : values.join(' ')
}

function renderTemplate(
  template: string,
  consts: Map<string, string>,
  arrays: Map<string, string[]>,
): string | null {
  let rendered = ''
  let cursor = 0
  for (const match of template.matchAll(/\$\{([^}]+)\}/g)) {
    const expression = match[1]
    if (expression === undefined || match.index === undefined) return null
    const replacement = resolveExpression(expression, consts, arrays)
    if (replacement === null) return null
    rendered += template.slice(cursor, match.index) + replacement
    cursor = match.index + match[0].length
  }
  return `${rendered}${template.slice(cursor)}`.replace(/\s+/g, ' ').trim()
}

function renderProductionDirectives(source: string): string[] | null {
  const arrays = readStringArrays(source)
  const templates = readReturnTemplates(source)
  if (arrays === null || templates === null) return null
  const consts = readStringConsts(source)
  const directives: string[] = []
  for (const template of templates) {
    const directive = renderTemplate(template, consts, arrays)
    if (directive === null) return null
    directives.push(directive)
  }
  return directives
}

function readDocumentedDirectives(docMarkdown: string): string[] | null {
  const fenceStart = docMarkdown.indexOf('```txt\n')
  if (fenceStart < 0) return null
  const bodyStart = fenceStart + '```txt\n'.length
  const fenceEnd = docMarkdown.indexOf('\n```', bodyStart)
  if (fenceEnd < 0) return null
  const directives = docMarkdown
    .slice(bodyStart, fenceEnd)
    .split(';')
    .map(directive => directive.trim().replace(/\s+/g, ' '))
    .filter(directive => directive.length > 0)
  return directives.length > 0 ? directives : null
}

function formatDirectiveMismatch(sourceDirectives: string[], docDirectives: string[]): string {
  const count = Math.max(sourceDirectives.length, docDirectives.length)
  const mismatches: string[] = []
  for (let index = 0; index < count; index += 1) {
    const sourceDirective = sourceDirectives[index]
    const docDirective = docDirectives[index]
    if (sourceDirective === docDirective) continue
    const name = (sourceDirective ?? docDirective ?? String(index)).split(' ')[0]
    mismatches.push(
      `\`${name}\` source \`${sourceDirective ?? '(missing)'}\` doc \`${docDirective ?? '(missing)'}\``,
    )
  }
  return mismatches.join('; ')
}

export function checkCspDocSync(input: { sourceCode: string; docMarkdown: string }): string[] {
  const sourceDirectives = renderProductionDirectives(input.sourceCode)
  if (sourceDirectives === null) {
    return [
      `::error file=${CSP_SOURCE_FILE}::${CSP_SOURCE_FILE}: could not render the production buildWebCsp policy; expected const string/array literals and a return array of single-line CSP directives`,
    ]
  }

  const docDirectives = readDocumentedDirectives(input.docMarkdown)
  if (docDirectives === null) {
    return [
      `::error file=${CSP_DOC_FILE}::${CSP_DOC_FILE}: could not parse the production CSP reference; the first \`\`\`txt fence must list buildWebCsp directives separated by semicolons`,
    ]
  }

  const mismatch = formatDirectiveMismatch(sourceDirectives, docDirectives)
  if (mismatch.length === 0) return []
  return [
    `::error file=${CSP_DOC_FILE}::${CSP_DOC_FILE}: production CSP reference differs from buildWebCsp: ${mismatch}`,
  ]
}
