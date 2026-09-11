import { parseCsvRows as parseCsvValues, stripCsvBom } from '@vouchington/csv'

const URL_COLUMN_NAMES = new Set(['url', 'xmlurl', 'rss_feed_url'])

export const stripBom = stripCsvBom

export function parseCsvRows(csvText: string): Record<string, string>[] {
  const [headers, ...dataRows] = parseCsvValues(csvText, { trim: true })
  if (headers == null) return []

  return dataRows.map(values =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]!])),
  )
}

export function parseCsvToUrls(csvText: string): { urls: string[]; recognized: boolean } {
  const allRows = parseCsvValues(csvText, { trim: true })

  if (allRows.length === 0) return { urls: [], recognized: false }

  const [headers, ...dataRows] = allRows
  let urlColIdx = -1
  for (let i = 0; i < headers!.length; i++) {
    if (URL_COLUMN_NAMES.has(headers![i]!.toLowerCase())) {
      urlColIdx = i
      break
    }
  }

  if (urlColIdx === -1) return { urls: [], recognized: false }

  const urls: string[] = []
  for (const row of dataRows) {
    const val = (row[urlColIdx] ?? '').trim()
    if (val) urls.push(val)
  }

  return { urls, recognized: true }
}
