export function withPackRuleDir<T extends { ruleDirs: string[] }>(config: T, packRules: string): T {
  return {
    ...config,
    ruleDirs: [packRules, ...config.ruleDirs.filter(dir => dir !== packRules)],
  }
}
