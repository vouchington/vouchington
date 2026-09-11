import { mergeRecords as mergePlatformRecords } from '@vouchington/utils/collections'

export {
  dedupeBy,
  dedupeById,
  dedupeByLast,
  mergePageResultsById,
} from '@vouchington/utils/collections'

export function mergeRecords<T, V>(
  pages: readonly T[],
  getRecord: (page: T) => Record<string, V>,
): Record<string, V> {
  const records = pages.map(getRecord)
  return mergePlatformRecords(records, record => record)
}
