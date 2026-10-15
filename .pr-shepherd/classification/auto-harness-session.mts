import type { ClassifyRule } from 'pr-shepherd/classify'

// Our session pointer is informational only when the link and marker name the same session.
const SESSION_POINTER =
  /^👀 \[View the Auto Harness session\]\((https:\/\/[^/\\\s?#)]+\/sessions\/(sess-[a-f0-9]{8}))\)\.\n\n<!-- auto-harness-session:\2 -->$/

const rule: ClassifyRule = item => {
  if (item.kind !== 'pr-comment' || item.authorType !== 'Bot') return null
  if (item.author.toLowerCase().replace(/\[bot\]$/, '') !== 'github-actions') return null
  const sessionUrl = SESSION_POINTER.exec(item.body.trim())?.[1]
  if (!sessionUrl) return null
  try {
    const url = new URL(sessionUrl)
    if (url.username || url.password) return null
  } catch {
    return null
  }
  return { autoResolve: true, suppress: true, reason: 'Auto Harness session pointer' }
}

export default rule
