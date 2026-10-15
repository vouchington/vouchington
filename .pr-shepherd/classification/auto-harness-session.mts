import type { ClassifyRule } from 'pr-shepherd/classify'

// Our session pointer is informational only when the link and marker name the same session.
const SESSION_POINTER =
  /^👀 \[View the Auto Harness session\]\(https:\/\/d2itfsupognuru\.cloudfront\.net\/sessions\/(sess-[a-f0-9]{8})\)\.\n\n<!-- auto-harness-session:\1 -->$/

const rule: ClassifyRule = item => {
  if (item.kind !== 'pr-comment' || item.authorType !== 'Bot') return null
  if (item.author.toLowerCase().replace(/\[bot\]$/, '') !== 'github-actions') return null
  if (!SESSION_POINTER.test(item.body.trim())) return null
  return { autoResolve: true, suppress: true, reason: 'Auto Harness session pointer' }
}

export default rule
