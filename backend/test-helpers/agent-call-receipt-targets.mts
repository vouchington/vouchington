import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function hardDeleteReceiptTestHostname(hostnameId: string): Promise<void> {
  await write(sql`/* hardDeleteReceiptTestHostname */
    DELETE FROM url_hostnames WHERE id = ${hostnameId}
  `)
}

export async function hardDeleteReceiptTestRssFeedItem(itemId: string): Promise<void> {
  await write(sql`/* hardDeleteReceiptTestRssFeedItem */
    DELETE FROM rss_feed_items WHERE id = ${itemId}
  `)
}
