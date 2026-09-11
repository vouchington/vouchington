export function assertExactDocTokens({
  actual,
  errors,
  expected,
  file,
  label,
}: {
  actual: readonly string[]
  errors: string[]
  expected: readonly string[]
  file: string
  label: string
}): void {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  for (const token of expected) {
    if (actualSet.has(token)) continue
    errors.push(`::error file=${file}::${file}: ${label} ${token} is missing from report docs`)
  }
  for (const token of actualSet) {
    if (expectedSet.has(token)) continue
    errors.push(`::error file=${file}::${file}: stale ${label} ${token} is documented`)
  }
}

export function assertExactOrderedDocTokens({
  actual,
  errors,
  expected,
  file,
  label,
}: {
  actual: readonly string[]
  errors: string[]
  expected: readonly string[]
  file: string
  label: string
}): void {
  const expectedList = [...expected]
  if (
    actual.length === expectedList.length &&
    actual.every((token, index) => token === expectedList[index])
  ) {
    return
  }
  errors.push(`::error file=${file}::${file}: ${label} order must be ${expectedList.join(' > ')}`)
}
