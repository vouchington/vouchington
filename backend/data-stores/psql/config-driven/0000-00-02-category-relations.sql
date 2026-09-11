-- Parent-child category relations for review snippet categories
-- Runs after entity relation tables are created (0000-00-01)
-- Each statement is atomic: if the relation exists, nothing is inserted

-- Sub-category: Software Products → Products
INSERT INTO "relation__topic__category__topic" (subject_id, object_id, votes_count_up, votes_score_up)
SELECT c.id, p.id, 1, 1
FROM topics c
JOIN topics p ON true
WHERE c.slug = 'software-products'
  AND c.deleted_at IS NULL
  AND p.slug = 'products'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "relation__topic__category__topic" r
    WHERE r.subject_id = c.id
      AND r.object_id = p.id
      AND r.deleted_at IS NULL
  );

-- Sub-category: Hardware Products → Products
INSERT INTO "relation__topic__category__topic" (subject_id, object_id, votes_count_up, votes_score_up)
SELECT c.id, p.id, 1, 1
FROM topics c
JOIN topics p ON true
WHERE c.slug = 'hardware-products'
  AND c.deleted_at IS NULL
  AND p.slug = 'products'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "relation__topic__category__topic" r
    WHERE r.subject_id = c.id
      AND r.object_id = p.id
      AND r.deleted_at IS NULL
  );

-- Sub-category: TV Show Seasons → Creative Work Seasons
INSERT INTO "relation__topic__category__topic" (subject_id, object_id, votes_count_up, votes_score_up)
SELECT c.id, p.id, 1, 1
FROM topics c
JOIN topics p ON true
WHERE c.slug = 'tv-show-seasons'
  AND c.deleted_at IS NULL
  AND p.slug = 'creative-work-seasons'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "relation__topic__category__topic" r
    WHERE r.subject_id = c.id
      AND r.object_id = p.id
      AND r.deleted_at IS NULL
  );

-- Sub-category: TV Shows → Creative Work Series
INSERT INTO "relation__topic__category__topic" (subject_id, object_id, votes_count_up, votes_score_up)
SELECT c.id, p.id, 1, 1
FROM topics c
JOIN topics p ON true
WHERE c.slug = 'tv-shows'
  AND c.deleted_at IS NULL
  AND p.slug = 'creative-work-series'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "relation__topic__category__topic" r
    WHERE r.subject_id = c.id
      AND r.object_id = p.id
      AND r.deleted_at IS NULL
  );

-- Sub-category: TV Show Episodes → Creative Work Episodes
INSERT INTO "relation__topic__category__topic" (subject_id, object_id, votes_count_up, votes_score_up)
SELECT c.id, p.id, 1, 1
FROM topics c
JOIN topics p ON true
WHERE c.slug = 'tv-show-episodes'
  AND c.deleted_at IS NULL
  AND p.slug = 'creative-work-episodes'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "relation__topic__category__topic" r
    WHERE r.subject_id = c.id
      AND r.object_id = p.id
      AND r.deleted_at IS NULL
  );
