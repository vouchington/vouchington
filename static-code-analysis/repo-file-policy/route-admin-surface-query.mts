import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ByteRange = { start: number; end: number }
export type NamedRange = { range: ByteRange; name: string }
export type RouteAdminSurfaceFacts = {
  declarations: NamedRange[]
  bodies: Array<NamedRange & { body: ByteRange }>
  containers: ByteRange[]
  calls: NamedRange[]
  firstArguments: NamedRange[]
  jsxTags: NamedRange[]
  topicComparisons: ByteRange[]
  returnedDefaults: NamedRange[]
}

type QueryCapture = { text: string; range: { byteOffset: ByteRange } }
type QueryMatch = {
  ruleId: string
  range: { byteOffset: ByteRange }
  metaVariables?: { single?: Record<string, QueryCapture> }
}

const queryDirectory = fileURLToPath(new URL('./ast-grep-queries/', import.meta.url))
const queryFiles = [
  'route-admin-function-declarations.yml',
  'route-admin-function-bodies.yml',
  'route-admin-containers.yml',
  'route-admin-calls.yml',
  'route-admin-first-arguments.yml',
  'route-admin-jsx-tags.yml',
  'route-admin-topic-inequality.yml',
  'route-admin-return-defaults.yml',
]
const queryText = queryFiles
  .map(file => readFileSync(join(queryDirectory, file), 'utf8').trim())
  .join('\n---\n')

export function collectRouteAdminSurfaceFacts(
  content: string,
  file: string,
): RouteAdminSurfaceFacts {
  const scan = spawnSync('ast-grep', ['scan', '--inline-rules', queryText, '--stdin', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: content,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (scan.error) throw new Error(`${file}: could not run ast-grep: ${scan.error.message}`)
  if (scan.status !== 0) {
    throw new Error(`${file}: ast-grep route-admin fact query failed: ${scan.stderr.trim()}`)
  }
  let matches: QueryMatch[]
  try {
    matches = JSON.parse(scan.stdout) as QueryMatch[]
  } catch (err) {
    throw new Error(`${file}: ast-grep route-admin fact output was not valid JSON`, {
      cause: err,
    })
  }
  if (!Array.isArray(matches))
    throw new Error(`${file}: ast-grep route-admin facts were not an array`)
  return matches.reduce<RouteAdminSurfaceFacts>(
    (facts, match) => {
      const range = byteRange(match.range)
      const capture = match.metaVariables?.single ?? {}
      switch (match.ruleId) {
        case 'route-admin-function-declarations':
          appendNamed(facts.declarations, range, capture.FUNCTION_NAME)
          break
        case 'route-admin-function-bodies': {
          const name = capture.FUNCTION_NAME
          const body = capture.FUNCTION_BODY && byteRange(capture.FUNCTION_BODY.range)
          if (name && body) facts.bodies.push({ range, name: name.text, body })
          break
        }
        case 'route-admin-containers':
          facts.containers.push(range)
          break
        case 'route-admin-calls':
          appendNamed(facts.calls, range, capture.CALL_NAME)
          break
        case 'route-admin-first-arguments':
          appendNamed(facts.firstArguments, range, capture.FIRST_ARGUMENT_NAME)
          break
        case 'route-admin-jsx-tags':
          appendNamed(facts.jsxTags, range, capture.JSX_NAME)
          break
        case 'route-admin-topic-inequality':
          facts.topicComparisons.push(range)
          break
        case 'route-admin-return-defaults':
          appendNamed(facts.returnedDefaults, range, capture.RETURNED_DEFAULT)
          break
        default:
          throw new Error(`${file}: unexpected ast-grep route-admin fact rule ${match.ruleId}`)
      }
      return facts
    },
    {
      declarations: [],
      bodies: [],
      containers: [],
      calls: [],
      firstArguments: [],
      jsxTags: [],
      topicComparisons: [],
      returnedDefaults: [],
    },
  )
}

function appendNamed(
  target: NamedRange[],
  range: ByteRange,
  capture: QueryCapture | undefined,
): void {
  if (capture) target.push({ range, name: capture.text })
}

function byteRange(value: { byteOffset: ByteRange }): ByteRange {
  const { start, end } = value.byteOffset
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new Error('ast-grep returned an invalid source byte range')
  }
  return { start, end }
}
