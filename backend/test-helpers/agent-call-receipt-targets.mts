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

/** Leave the durable paid-operation key, as a manual partition retirement does. */
export async function deleteReceiptRowForTest(operationKey: string): Promise<void> {
  await write(sql`/* deleteReceiptRowForTest */
    DELETE FROM ai_agent_call_receipts WHERE id =
      (SELECT id FROM ai_agent_call_receipt_keys WHERE operation_key = ${operationKey})
  `)
}
