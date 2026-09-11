import { parse as load } from 'yaml'

import type { PackageGateInventoryRow } from './types.mts'

const PACKAGE_GATE_KEYS = [
  'allowBuilds',
  'dangerouslyAllowAllBuilds',
  'ignoredOptionalDependencies',
  'minimumReleaseAge',
  'minimumReleaseAgeExclude',
  'overrides',
  'packageExtensions',
  'strictDepBuilds',
] as const

export function collectPackageGatesFromFile(
  file: string,
  source: string,
  packageGates: Map<string, PackageGateInventoryRow>,
): void {
  if (file !== 'pnpm-workspace.yaml') return

  let parsed: unknown
  try {
    parsed = load(source)
  } catch {
    return
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

  for (const key of PACKAGE_GATE_KEYS) {
    const values = extractPackageGateValues((parsed as Record<string, unknown>)[key])
    if (values.length === 0) continue
    packageGates.set(key, { name: key, values, files: [file] })
  }
}

function extractPackageGateValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(entry => (isScalarValue(entry) ? [String(entry)] : []))
  }
  if (isPlainObject(value)) {
    return Object.keys(value)
  }
  return isScalarValue(value) ? [String(value)] : []
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isScalarValue(value: unknown): value is string | number | boolean | Date {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  )
}
