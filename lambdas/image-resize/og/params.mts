import { isPlacementSourcePolicy, type PlacementSourcePolicy } from '@ts-shared/url-signing'
import { RequestParseError } from '../errors.mts'

// Mirrors the discriminated union produced by web/lib/seo/og-image-url.ts.
// Generic and landing params are disjoint — there is no shared optional
// superset — so each branch is validated (and returned) independently.
export interface OgGenericParams {
  type: 'generic'
  eyebrow: string
  title: string
  description: string
  domainLabel: string
}

export interface OgLandingParams {
  type: 'landing'
  displayName: string
  username: string
  topCategories: string[]
  dependencies: PlacementSourcePolicy[]
}

export type OgParams = OgGenericParams | OgLandingParams

// Defensive cap even though the web side already caps at 5 — the lambda must
// not trust the signed-but-client-supplied payload shape blindly.
export const MAX_TOP_CATEGORIES = 5

function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new RequestParseError(`Invalid OG params: missing or empty "${key}"`, 400)
  }
  return value
}

function requireStringArray(obj: Record<string, unknown>, key: string): string[] {
  const value = obj[key]
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new RequestParseError(`Invalid OG params: "${key}" must be an array of strings`, 400)
  }
  return value.slice(0, MAX_TOP_CATEGORIES)
}

const MAX_OG_DEPENDENCIES = 4

function readDependencies(obj: Record<string, unknown>): PlacementSourcePolicy[] {
  const value = obj.dependencies
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_OG_DEPENDENCIES) {
    throw new RequestParseError('Invalid OG params: "dependencies" must be a short array', 400)
  }
  return value.map(dependency => {
    if (!isPlacementSourcePolicy(dependency)) {
      throw new RequestParseError('Invalid OG params: dependency is not a placement', 400)
    }
    return {
      placementId: dependency.placementId,
      revision: dependency.revision,
      imageId: dependency.imageId,
    }
  })
}

// The web payload also carries a `rendererVersion` cache-buster
// (web/lib/seo/og-image-url.ts's OG_RENDERER_VERSION) so a renderer change
// mints a fresh /og/ URL instead of serving a stale immutable-cached PNG.
// It is intentionally not read here: each branch below is reconstructed from
// known fields only, so unknown fields like `rendererVersion` are silently
// dropped before rendering — do not "fix" this into a rejection.
export function validateOgParams(value: unknown): OgParams {
  if (typeof value !== 'object' || value === null) {
    throw new RequestParseError('Invalid OG params: expected an object', 400)
  }
  const obj = value as Record<string, unknown>

  if (obj.type === 'generic') {
    return {
      type: 'generic',
      eyebrow: requireString(obj, 'eyebrow'),
      title: requireString(obj, 'title'),
      description: requireString(obj, 'description'),
      domainLabel: requireString(obj, 'domainLabel'),
    }
  }

  if (obj.type === 'landing') {
    return {
      type: 'landing',
      displayName: requireString(obj, 'displayName'),
      username: requireString(obj, 'username'),
      topCategories: requireStringArray(obj, 'topCategories'),
      dependencies: readDependencies(obj),
    }
  }

  throw new RequestParseError(`Invalid OG params: unknown type "${String(obj.type)}"`, 400)
}
