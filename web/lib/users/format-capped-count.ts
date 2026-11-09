import { formatCompactNumber, formatNumber, type NumberFormatLocale } from '@ts-shared/utils/format'

/** Exact count, or the compact cap with a plus sign (such as "1K+") when the real total is larger. */
export function formatCappedCount(
  count: number,
  capped: boolean,
  locale?: NumberFormatLocale,
): string {
  return capped ? `${formatCompactNumber(count, locale)}+` : formatNumber(count, locale)
}
