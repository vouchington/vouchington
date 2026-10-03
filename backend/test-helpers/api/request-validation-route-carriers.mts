export function assertQueryCarrierCoverage(
  sourceQueryReads: ReadonlyMap<string, ReadonlySet<string>>,
  runtimeCarrierFamilies: ReadonlyMap<string, ReadonlySet<string>>,
  generatedOperations: Readonly<Record<string, unknown>>,
  specializedQueryInputs: Readonly<Record<string, readonly string[]>>,
): void {
  const errors: string[] = []
  for (const [operation, reads] of sourceQueryReads) {
    const specialized = specializedQueryInputs[operation]
    if (specialized) {
      if (specialized.length !== reads.size || specialized.some(key => !reads.has(key))) {
        errors.push(`${operation} specialized query input differs from its reviewed keys`)
      }
      continue
    }
    if (!runtimeCarrierFamilies.get(operation)?.has('query')) {
      errors.push(`${operation} reads query input without runtime query validation`)
      continue
    }
    const query = (
      generatedOperations[operation] as
        | { query?: { properties?: Record<string, unknown> } }
        | undefined
    )?.query
    if (!query) {
      errors.push(`${operation} reads query input without a generated query carrier`)
      continue
    }
    for (const key of reads) {
      if (!Object.hasOwn(query.properties ?? {}, key)) {
        errors.push(`${operation} reads undeclared query key ${key}`)
      }
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'))
}

export function assertDeclaredCarrierFamiliesValidated(
  runtimeValidated: ReadonlySet<string>,
  runtimeCarrierFamilies: ReadonlyMap<string, ReadonlySet<string>>,
  generatedOperations: Readonly<Record<string, unknown>>,
  specializedQueryInputs: Readonly<Record<string, readonly string[]>>,
): void {
  const errors: string[] = []
  for (const operation of runtimeValidated) {
    const generated = generatedOperations[operation] as Record<string, unknown> | undefined
    if (!generated) continue
    const validated = runtimeCarrierFamilies.get(operation) ?? new Set<string>()
    for (const family of ['path', 'query', 'body']) {
      if (!Object.hasOwn(generated, family) || validated.has(family)) continue
      if (family === 'query' && specializedQueryInputs[operation]) continue
      errors.push(`${operation} has a generated ${family} carrier without runtime validation`)
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'))
}
