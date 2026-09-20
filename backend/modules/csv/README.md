# @modules/csv

CSV parsing utilities — strips BOM characters and parses CSV text into row objects.

## Exports

### `stripBom(text: string): string`

Removes the UTF-8 BOM prefix (`\uFEFF`) often prepended by Excel or Google Sheets exports.

### `parseCsvRows(csvText: string): Record<string, string>[]`

Parses a CSV string (after BOM stripping) into an array of row objects where keys are column headers.
Parsing delegates to `@vouchington/csv`; this module retains Vouchington's object-row API.

### `parseCsvToUrls(csvText: string): { urls: string[]; recognized: boolean }`

Parses a CSV string and extracts URLs from the first column named `url`, `xmlurl`, or
`rss_feed_url` (case-insensitive). Returns `{ recognized: false, urls: [] }` when no such column
exists. Callers already holding a string must pass that string; do not wrap it in a `Buffer`.
JSON import bodies materialize the CSV before this helper runs. Output serialization uses
`streamCsvRows`; stream-parse is not this module's job while the HTTP boundary is a JSON string.

### `streamCsvRows(rows, columns): NodeJS.ReadableStream`

Serializes an array of row objects to a streaming CSV with a header row.

- `rows` — array of row objects (`Record<string, string | null | undefined>[]`); missing keys default to empty string
- `columns` — ordered array of column names used for the header row and column ordering

Returns a `NodeJS.ReadableStream`. Cells starting with `=`, `+`, `-`, `@`, a tab, or a carriage
return are prefixed with `'` to prevent formula injection in spreadsheet applications. Serialization
delegates to `@vouchington/csv` and only emits the declared columns.

## Related

- Parent: [../README.md](../README.md)
- User import/export: [../../services/user-import-export/README.md](../../services/user-import-export/README.md)
