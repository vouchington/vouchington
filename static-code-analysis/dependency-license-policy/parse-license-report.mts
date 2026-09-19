export interface LicenseReportEntry {
  name: string
  versions?: string[]
}

/** Shape of `pnpm licenses list --json`: license expression -> package entries. */
export type LicenseReport = Record<string, LicenseReportEntry[]>

function getStringList(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`expected ${path} to be an array of strings`)
  }
  return value
}

export function parseLicenseReport(value: unknown): LicenseReport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('expected a JSON object keyed by license expression')
  }

  const report = Object.create(null) as LicenseReport
  for (const [licenseExpression, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) {
      throw new Error(`expected license group ${JSON.stringify(licenseExpression)} to be an array`)
    }
    report[licenseExpression] = entries.map((entry, index) => {
      const path = `license group ${JSON.stringify(licenseExpression)} entry ${String(index)}`
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error(`expected ${path} to be an object`)
      }
      const { name, versions } = entry as Record<string, unknown>
      if (typeof name !== 'string') {
        throw new Error(`expected ${path}.name to be a string`)
      }
      if (versions === undefined) return { name }
      return { name, versions: getStringList(versions, `${path}.versions`) }
    })
  }
  return report
}
