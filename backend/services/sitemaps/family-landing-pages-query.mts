import sql from 'sql-template-strings'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'

export function buildLandingPagesQuery() {
  const query = sql`/* buildSitemapLandingPagesQuery */
    SELECT
      CASE
        WHEN ulp.is_default THEN CONCAT('/@', u.username)
        ELSE CONCAT('/@', u.username, '/', ulp.slug)
      END AS path,
      GREATEST(
        ulp.updated_at,
        u.updated_at,
        COALESCE((
          SELECT MAX(ulpi_lastmod.updated_at)
          FROM user_landing_page_items ulpi_lastmod
          WHERE ulpi_lastmod.landing_page_id = ulp.id
        ), ulp.updated_at),
        COALESCE((
          SELECT MAX(ulpgm_lastmod.updated_at)
          FROM user_landing_page_items ulpi_lastmod
          JOIN user_landing_page_group_members ulpgm_lastmod
            ON ulpgm_lastmod.landing_page_item_id = ulpi_lastmod.id
          WHERE ulpi_lastmod.landing_page_id = ulp.id
        ), ulp.updated_at),
        COALESCE((
          SELECT MAX(upl_lastmod.updated_at)
          FROM user_landing_page_items ulpi_lastmod
          JOIN user_profile_links upl_lastmod ON upl_lastmod.id = ulpi_lastmod.profile_link_id
          WHERE ulpi_lastmod.landing_page_id = ulp.id
        ), ulp.updated_at),
        COALESCE((
          SELECT MAX(review_lastmod.updated_at)
          FROM user_landing_page_items ulpi_lastmod
          JOIN posts review_lastmod ON review_lastmod.id = ulpi_lastmod.review_id
          JOIN view_public_post_eligibility review_lastmod_eligibility
            ON review_lastmod_eligibility.post_id = review_lastmod.id
          WHERE ulpi_lastmod.landing_page_id = ulp.id
        ), ulp.updated_at),
        COALESCE((
          SELECT MAX(group_review_lastmod.updated_at)
          FROM user_landing_page_items ulpi_lastmod
          JOIN user_landing_page_group_members ulpgm_lastmod
            ON ulpgm_lastmod.landing_page_item_id = ulpi_lastmod.id
          JOIN posts group_review_lastmod ON group_review_lastmod.id = ulpgm_lastmod.review_id
          JOIN view_public_post_eligibility group_review_lastmod_eligibility
            ON group_review_lastmod_eligibility.post_id = group_review_lastmod.id
          WHERE ulpi_lastmod.landing_page_id = ulp.id
        ), ulp.updated_at),
        COALESCE((
          SELECT MAX(referral_lastmod.updated_at)
          FROM user_landing_page_items ulpi_lastmod
          JOIN user_referral_program_links referral_lastmod
            ON referral_lastmod.id = ulpi_lastmod.referral_link_id
          WHERE ulpi_lastmod.landing_page_id = ulp.id
        ), ulp.updated_at),
        COALESCE((
          SELECT MAX(group_referral_lastmod.updated_at)
          FROM user_landing_page_items ulpi_lastmod
          JOIN user_landing_page_group_members ulpgm_lastmod
            ON ulpgm_lastmod.landing_page_item_id = ulpi_lastmod.id
          JOIN user_referral_program_links group_referral_lastmod
            ON group_referral_lastmod.id = ulpgm_lastmod.referral_link_id
          WHERE ulpi_lastmod.landing_page_id = ulp.id
        ), ulp.updated_at)
      ) AS updated_at
    FROM user_landing_pages ulp
    JOIN users u ON u.id = ulp.user_id
    WHERE u.deleted_at IS NULL
      AND u.username IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_suspensions us
        WHERE us.user_id = u.id
          AND us.lifted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM user_landing_page_items ulpi
        WHERE ulpi.landing_page_id = ulp.id
          AND (
            EXISTS (
              SELECT 1
              FROM user_profile_links upl
              JOIN urls profile_url ON profile_url.id = upl.url_id
              WHERE upl.id = ulpi.profile_link_id
                AND upl.user_id = u.id
                AND ulpi.item_type = 'profile_link'
                AND (
                  (upl.link_type = 'url' AND profile_url.url IS NOT NULL AND profile_url.url <> '')
                  OR (upl.link_type <> 'url' AND upl.handle IS NOT NULL AND upl.handle <> '')
                )
            )
            OR (ulpi.item_type = 'link' AND ulpi.link_label IS NOT NULL AND ulpi.link_url IS NOT NULL)
            OR EXISTS (
              SELECT 1
              FROM posts p
              WHERE p.id = ulpi.review_id
                AND p.created_by_id = u.id
                AND ulpi.item_type = 'review'
                AND p.post_type = 'review'
                AND EXISTS (
                  SELECT 1
                  FROM posts root_post
                  WHERE root_post.id = COALESCE(p.root_id, p.id)
                    AND `
  query.append(buildPublicPostEligibilityFilter('p', 'root_post')).append(sql`
                )
            )
            OR EXISTS (
              SELECT 1
              FROM user_referral_program_links urpl
              WHERE urpl.id = ulpi.referral_link_id
                AND urpl.user_id = u.id
                AND ulpi.item_type = 'referral_link'
                AND urpl.deleted_at IS NULL
                AND urpl.activated_at IS NOT NULL
                AND urpl.deactivated_at IS NULL
            )
            OR EXISTS (
              SELECT 1
              FROM user_landing_page_group_members ulpgm
              LEFT JOIN posts group_review
                ON group_review.id = ulpgm.review_id
                AND group_review.created_by_id = u.id
                AND group_review.post_type = 'review'
                AND EXISTS (
                  SELECT 1
                  FROM posts group_review_root
                  WHERE group_review_root.id = COALESCE(group_review.root_id, group_review.id)
                    AND `)
  query.append(buildPublicPostEligibilityFilter('group_review', 'group_review_root')).append(sql`
                )
              LEFT JOIN user_referral_program_links group_link
                ON group_link.id = ulpgm.referral_link_id
                AND group_link.user_id = u.id
                AND group_link.deleted_at IS NULL
                AND group_link.activated_at IS NOT NULL
                AND group_link.deactivated_at IS NULL
              WHERE ulpgm.landing_page_item_id = ulpi.id
                AND ulpi.item_type = 'topic_group'
                AND EXISTS (
                  SELECT 1
                  FROM topics group_topic
                  WHERE group_topic.id = ulpi.topic_id
                    AND group_topic.deleted_at IS NULL
                )
                AND (group_review.id IS NOT NULL OR group_link.id IS NOT NULL)
            )
          )
      )
    ORDER BY ulp.id DESC
  `)
  return query
}
