import { writeExportFiles } from '../services/account-data-requests/export.mts'
import { streamCopyrightExports } from '../services/copyright-notices/stream-copyright.mts'

/** Exercise the real account and copyright service composition used by the export worker. */
export function writeAccountExportFiles(userId: string, exportDir: string): Promise<void> {
  return writeExportFiles(userId, exportDir, streamCopyrightExports)
}
