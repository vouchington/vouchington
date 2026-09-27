import type { PackageVersion } from './image-retention-github.mts'

const API = 'https://api.github.com'
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u
export const PACKAGE_PAGE_SIZE = 100

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const normalized = value.replace(
    /(?:\.(\d{1,3}))?Z$/u,
    (_match, fraction?: string) => `.${(fraction ?? '').padEnd(3, '0')}Z`,
  )
  return new Date(value).toISOString() === normalized
}

export function parsePackageVersion(value: unknown): PackageVersion {
  const item = record(value)
  const tags = record(record(item?.['metadata'])?.['container'])?.['tags']
  if (
    !item ||
    !Number.isSafeInteger(item['id']) ||
    Number(item['id']) <= 0 ||
    typeof item['name'] !== 'string' ||
    !DIGEST.test(item['name']) ||
    !validDate(item['created_at']) ||
    !validDate(item['updated_at']) ||
    Date.parse(item['updated_at']) < Date.parse(item['created_at']) ||
    !Array.isArray(tags) ||
    !tags.every(
      tag =>
        typeof tag === 'string' &&
        tag.length > 0 &&
        tag.length <= 256 &&
        ![...tag].some(character => character < ' ' || character === '\u007f'),
    ) ||
    new Set(tags).size !== tags.length
  )
    throw new Error('invalid package version')
  return {
    createdAt: item['created_at'],
    digest: item['name'],
    id: Number(item['id']),
    tags: [...tags],
    updatedAt: item['updated_at'],
  }
}

export function nextPackagePage(link: string | null, current: URL): number | undefined {
  if (!link) return undefined
  let next: URL | undefined
  for (const part of link.split(',')) {
    const match = /^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/u.exec(part)
    if (!match) throw new Error('invalid pagination')
    if (match[2]?.split(/\s+/u).includes('next')) {
      if (next) throw new Error('invalid pagination')
      next = new URL(match[1]!)
    }
  }
  if (!next) return undefined
  const page = Number(next.searchParams.get('page'))
  if (
    next.origin !== API ||
    next.pathname !== current.pathname ||
    next.searchParams.getAll('page').length !== 1 ||
    next.searchParams.getAll('per_page').length !== 1 ||
    next.searchParams.get('per_page') !== String(PACKAGE_PAGE_SIZE) ||
    !Number.isSafeInteger(page) ||
    page !== Number(current.searchParams.get('page')) + 1
  )
    throw new Error('invalid pagination')
  for (const [key, value] of current.searchParams)
    if (key !== 'page' && next.searchParams.get(key) !== value)
      throw new Error('invalid pagination')
  for (const [key, value] of next.searchParams)
    if (key !== 'page' && current.searchParams.get(key) !== value)
      throw new Error('invalid pagination')
  return page
}

export { record as retentionJsonRecord }
