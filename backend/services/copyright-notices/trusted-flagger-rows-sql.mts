import sql from 'sql-template-strings'

export function flaggerRowsSql() {
  return sql`/* flaggerRowsSql */
    SELECT flagger.id, flagger.name, flagger.user_id, flagger.awarding_coordinator_name,
      flagger.awarding_member_state, flagger.awarded_on::text AS awarded_on, flagger.award_reference,
      flagger.area_of_expertise, flagger.area_description, latest.change_type AS latest_change_type
    FROM copyright_trusted_flaggers flagger
    LEFT JOIN LATERAL (
      SELECT change.change_type FROM copyright_trusted_flagger_changes change
      WHERE change.copyright_trusted_flagger_id = flagger.id
        AND NOT EXISTS (
          SELECT 1 FROM copyright_trusted_flagger_changes successor
          WHERE successor.copyright_trusted_flagger_id = change.copyright_trusted_flagger_id
            AND successor.previous_copyright_trusted_flagger_change_id = change.id
        )
      LIMIT 1
    ) latest ON true
  `
}
