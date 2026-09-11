export type PaginatedListParams = Record<string, string | number | boolean | undefined>

export function getPaginatedQueryKey(endpoint: string, params: PaginatedListParams): string {
  const paramStr = new URLSearchParams(
    Object.keys(params)
      .toSorted()
      .map(key => [key, String(params[key] ?? '')] as [string, string]),
  ).toString()
  return `${endpoint}|${paramStr}`
}
