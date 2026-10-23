import { write } from '@data-stores/psql'

/** Parse-success tail exposes the email branch of the agent dispatch union. */
export async function seedCopyrightSelection3511(): Promise<void> {
  console.log('Seeding 10000 copyright email intake parse outcomes...')
  await write(`/* seedCopyrightSelection3511:storageObjects */
    INSERT INTO copyright_notice_storage_objects (id, storage_key)
    SELECT ('019e0000-9d00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      'explain/copyright/email/' || ordinal
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
  await write(`/* seedCopyrightSelection3511:intakes */
    INSERT INTO copyright_notice_email_intakes
      (id, amazon_ses_message_id, received_at, raw_storage_object_id,
       raw_sha256, raw_media_type_id,
       raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict)
    SELECT ('019e0000-9b00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      'explain-copyright-email-' || ordinal, NOW() - INTERVAL '2 days',
      ('019e0000-9d00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      decode(lpad(to_hex(ordinal), 64, '0'), 'hex'),
      (SELECT id FROM media_types ORDER BY id LIMIT 1),
      0, 'pass', 'pass', 'pass', 'pass', 'pass'
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
  await write(`/* seedCopyrightSelection3511:parses */
    INSERT INTO copyright_notice_email_intake_parses
      (id, copyright_notice_email_intake_id, status, sender_email_ciphertext,
       subject_ciphertext, body_ciphertext, error_ciphertext)
    SELECT ('019e0000-9c00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      ('019e0000-9b00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      CASE WHEN ordinal % 100 = 0 THEN 'succeeded'::copyright_notice_email_intake_parse_statuses
        ELSE 'failed'::copyright_notice_email_intake_parse_statuses END,
      CASE WHEN ordinal % 100 = 0 THEN 'synthetic@example.test' ELSE NULL END,
      CASE WHEN ordinal % 100 = 0 THEN 'Synthetic claim' ELSE NULL END,
      CASE WHEN ordinal % 100 = 0 THEN 'Synthetic body' ELSE NULL END,
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE 'synthetic parse failure' END
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
}
