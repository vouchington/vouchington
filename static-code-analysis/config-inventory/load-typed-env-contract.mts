import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { TypedEnvContractEntry } from './types.mts'

const TYPED_ENV_CONTRACT_ENTRYPOINT = 'ts-shared/env-contract/index.mts'

export async function loadTypedEnvContractData(
  repoRoot: string,
): Promise<{ entries: TypedEnvContractEntry[]; constants: Map<string, string> }> {
  const entrypoint = join(repoRoot, TYPED_ENV_CONTRACT_ENTRYPOINT)
  if (!existsSync(entrypoint)) return { entries: [], constants: new Map<string, string>() }

  const contractModule = await importTypedEnvContract(entrypoint)
  const [entries, constants] = await Promise.all([
    normalizeTypedEnvContractEntries(
      readFirstExport(contractModule, [
        'ENV_VAR_CONTRACT',
        'collectTypedEnvContractEntries',
        'typedEnvContractEntries',
      ]),
    ),
    normalizeTypedEnvContractConstants(
      readFirstExport(contractModule, [
        'ENV_VAR_CONSTANTS',
        'collectTypedEnvVarConstants',
        'typedEnvVarConstants',
      ]),
    ),
  ])
  return { entries, constants }
}

async function importTypedEnvContract(entrypoint: string): Promise<Record<string, unknown>> {
  try {
    return (await import(pathToFileURL(entrypoint).href)) as Record<string, unknown>
  } catch (error) {
    throw new Error(`failed to load typed env contract at ${entrypoint}`, { cause: error })
  }
}

function readFirstExport(module: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (name in module) return module[name]
  }
  return undefined
}

async function normalizeTypedEnvContractEntries(value: unknown): Promise<TypedEnvContractEntry[]> {
  const resolved = await resolveExportValue(value)
  if (!Array.isArray(resolved)) return []
  return resolved.flatMap(entry => normalizeTypedEnvContractEntry(entry))
}

function normalizeTypedEnvContractEntry(entry: unknown): TypedEnvContractEntry[] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
  const raw = entry as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name : ''
  if (!name) return []
  return [
    {
      name,
      contractKey:
        typeof raw.contractKey === 'string'
          ? raw.contractKey
          : typeof raw.key === 'string'
            ? raw.key
            : undefined,
      sourceOfTruth:
        typeof raw.sourceOfTruth === 'string'
          ? raw.sourceOfTruth
          : typeof raw.source === 'string'
            ? raw.source
            : undefined,
      sensitivity: typeof raw.sensitivity === 'string' ? raw.sensitivity : undefined,
      runtimeSurfaces: normalizeStringArray(raw.runtimeSurfaces ?? raw.surfaces),
    },
  ]
}

async function normalizeTypedEnvContractConstants(value: unknown): Promise<Map<string, string>> {
  const resolved = await resolveExportValue(value)
  if (resolved == null) return new Map<string, string>()
  if (resolved instanceof Map) {
    return new Map(
      [...resolved.entries()].flatMap(([key, envName]) =>
        typeof key === 'string' && typeof envName === 'string' ? [[key, envName]] : [],
      ),
    )
  }
  if (Array.isArray(resolved)) {
    return new Map(
      resolved.flatMap(entry => {
        if (!Array.isArray(entry) || entry.length < 2) return []
        const [key, envName] = entry
        return typeof key === 'string' && typeof envName === 'string' ? [[key, envName]] : []
      }),
    )
  }
  if (typeof resolved === 'object') {
    return new Map(
      Object.entries(resolved as Record<string, unknown>).flatMap(([key, envName]) =>
        typeof envName === 'string' ? [[key, envName]] : [],
      ),
    )
  }
  return new Map<string, string>()
}

async function resolveExportValue(value: unknown): Promise<unknown> {
  if (typeof value === 'function') return resolveExportValue(value())
  if (value instanceof Promise) return value
  return value
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => (typeof entry === 'string' ? [entry] : []))
}
