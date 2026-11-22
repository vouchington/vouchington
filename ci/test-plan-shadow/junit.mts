export type JunitFile = { file: string; seconds: number; failed: boolean }

function attribute(tag: string, name: string): string | undefined {
  const raw = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
  return raw
    ?.replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

/** Reduces a JUnit file or class label to the repo-relative test file path. */
export function testFilePath(label: string): string {
  return label
    .replace(/^\[[^\]]*\]\s*›\s*/, '')
    .replace(/\s*›.*$/, '')
    .replace(/:\d+(:\d+)?$/, '')
    .replace(/^\.\//, '')
}

type OpenCase = { tag: string; selfClosing: boolean; start: number }

/** One entry per test file in a JUnit report, summing its test durations and failures. */
export function parseJunit(xml: string): JunitFile[] {
  const files = new Map<string, JunitFile>()
  const suites: string[] = []
  let current: OpenCase | undefined
  const finish = (end: number) => {
    if (!current) return
    const label =
      attribute(current.tag, 'file') ?? attribute(current.tag, 'classname') ?? suites.at(-1) ?? ''
    const file = testFilePath(label)
    const body = current.selfClosing ? '' : xml.slice(current.start, end)
    const entry = files.get(file) ?? { file, seconds: 0, failed: false }
    entry.seconds += Number(attribute(current.tag, 'time') ?? 0) || 0
    entry.failed ||= /<(failure|error)\b/.test(body)
    if (file) files.set(file, entry)
    current = undefined
  }
  for (const token of xml.matchAll(/<testsuite\b[^>]*>|<\/testsuite>|<testcase\b[^>]*>/g)) {
    const text = token[0]
    finish(token.index)
    if (text.startsWith('</testsuite')) suites.pop()
    else if (text.startsWith('<testsuite')) suites.push(attribute(text, 'name') ?? '')
    else current = { tag: text, selfClosing: text.endsWith('/>'), start: token.index + text.length }
  }
  finish(xml.length)
  return [...files.values()]
}
