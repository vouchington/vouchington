export function unregisteredRules(
  modules: readonly Record<string, unknown>[],
  registry: readonly unknown[],
): string[] {
  const rules = modules.flatMap(module =>
    Object.values(module).filter(
      (value): value is { id: string; match: (...args: never[]) => unknown } =>
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        typeof value.id === 'string' &&
        'match' in value &&
        typeof value.match === 'function',
    ),
  )
  if (rules.length === 0) return ['No exported retry rules discovered']
  return rules.flatMap(rule =>
    !registry.includes(rule)
      ? [`rule "${rule.id}" is exported but missing from the RULES array`]
      : [],
  )
}
