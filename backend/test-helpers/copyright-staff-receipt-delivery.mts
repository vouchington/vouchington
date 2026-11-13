import { beginTransaction } from '@data-stores/psql'
import { createOutboundCopyrightCorrespondence } from '../services/copyright-notices/correspondence.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'

/** A committed delivery prerequisite for participant projection and replay subjects. */
export async function seedCopyrightStaffReceiptDelivery(
  input: Parameters<typeof createCopyrightDeliveryIntent>[0],
) {
  await using transaction = await beginTransaction()
  const intent = await createCopyrightDeliveryIntent(input, transaction)
  await transaction.commit()
  return intent
}

/** Complete canonical receipt dependency, including its lifecycle event. */
export async function seedCopyrightStaffReceiptCorrespondence(
  input: Parameters<typeof createOutboundCopyrightCorrespondence>[0],
) {
  await using transaction = await beginTransaction()
  const correspondence = await createOutboundCopyrightCorrespondence(input, transaction)
  await transaction.commit()
  return correspondence
}
