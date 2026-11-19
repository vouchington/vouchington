import onError from '@modules/on-error'
import { getExportDownloadUrl } from '@services/account-data-requests'

/**
 * Signs the export link for the status stream. A signing failure must not close the stream on a
 * ready export, so it is reported and the status is sent without a link.
 */
export function signExportDownloadUrlOrReport(s3Key: string): Promise<string | null> {
  return getExportDownloadUrl(s3Key).catch((err: unknown) => {
    onError(new Error('Data export download URL signing failed', { cause: err }))
    return null
  })
}
