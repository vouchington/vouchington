import type { ClassifyRule } from 'pr-shepherd/classify'

const quotaNotice = {
  autoResolve: true,
  suppress: true,
  reason: 'codex rate-limit notice',
} as const

const activityNotice = {
  autoResolve: true,
  suppress: true,
  reason: 'codex review-summary activity notice',
} as const

const rule: ClassifyRule = item => {
  if (item.author !== 'chatgpt-codex-connector' && item.author !== 'chatgpt-codex-connector[bot]')
    return null
  // Real Codex Review summaries start with a heading such as `### 💡 Codex Review`.
  // Do not suppress those even when the body quotes a quota sentence.
  if (/###[^\n]*Codex Review/i.test(item.body)) return null
  if (
    /you have reached your (?:codex )?usage limits for \w+ reviews|usage limits have been reached/i.test(
      item.body,
    )
  )
    return quotaNotice
  if (/<!--\s*codex-pull-request-review-summary\s*-->|^## Codex Review Summary\b/im.test(item.body))
    return activityNotice
  return null
}

export default rule
