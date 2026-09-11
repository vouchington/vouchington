import type { ClassifyRule } from 'pr-shepherd/classify'

const rule: ClassifyRule = item => {
  if (item.author !== 'coderabbitai' && item.author !== 'coderabbitai[bot]') return null
  return {
    autoResolve: true,
    suppress: true,
    reason: 'coderabbit suppressed (always for now)',
  }
}

export default rule
