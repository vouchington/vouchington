import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'

export const completeClassifierFixtureBatch = (batchId: string) =>
  write(sql`/* completeClassifierFixtureBatch */
    UPDATE classifier_decision_batches
    SET input_sha256 = decode(repeat('a', 64), 'hex'), completed_at = CURRENT_TIMESTAMP
    WHERE id = ${batchId}`)
