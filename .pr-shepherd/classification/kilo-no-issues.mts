import type { ClassifyRule } from 'pr-shepherd/classify'

const rule: ClassifyRule = item => {
  if (item.author !== 'kilo-code-bot' && item.author !== 'kilo-code-bot[bot]') return null
  if (!/No Issues Found/i.test(item.body)) return null
  return { autoResolve: true, suppress: true, reason: 'kilo-code-bot no-issues report' }
}

export default rule
