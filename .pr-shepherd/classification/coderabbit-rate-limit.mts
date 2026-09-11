import type { ClassifyRule } from 'pr-shepherd/classify'

const rule: ClassifyRule = item => {
  if (item.author !== 'coderabbitai' && item.author !== 'coderabbitai[bot]') return null
  if (!/Review limit reached/i.test(item.body)) return null
  return { autoResolve: true, suppress: true, reason: 'coderabbit rate-limit notice' }
}

export default rule
