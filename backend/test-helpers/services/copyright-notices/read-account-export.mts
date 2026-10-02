import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCsvRows } from '../../../modules/csv/index.mts'
import { writeExportFiles } from '../../../services/account-data-requests/export.mts'

export type AccountExportView = {
  /** The parsed rows of one CSV in the export; throws when the export has no such file. */
  rows: (file: string) => Record<string, string>[]
  /** Every file of the export joined together, for asserting a value appears nowhere. */
  serialized: string
}

/** Writes the account's data export to a temporary directory and reads it back as parsed CSVs. */
export async function readAccountExport(userId: string): Promise<AccountExportView> {
  const parentDir = await mkdtemp(join(tmpdir(), 'voucha-account-export-test-'))
  const exportDir = join(parentDir, 'export')
  try {
    await writeExportFiles(userId, exportDir)
    const names = await readdir(exportDir)
    const contents = await Promise.all(names.map(name => readFile(join(exportDir, name), 'utf8')))
    const files = new Map(names.map((name, index) => [name, contents[index]!]))
    return {
      rows: file => {
        const csv = files.get(file)
        if (csv === undefined) throw new Error(`${file} missing from the export`)
        return parseCsvRows(csv)
      },
      serialized: [...files.values()].join('\n'),
    }
  } finally {
    await rm(parentDir, { recursive: true, force: true })
  }
}
