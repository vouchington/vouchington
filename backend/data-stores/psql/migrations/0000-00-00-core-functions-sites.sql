-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added voucha_english text search configuration (unaccent support)
-- Merged from: 0000-00-00-functions-and-sites.sql

-- ==========================================================================
-- 0000-00-00-functions-and-sites.sql
-- ============================================================================

CREATE TYPE content_creation_channels AS ENUM ('web', 'swift', 'dotnet', 'api', 'mcp', 'system');
COMMENT ON TYPE content_creation_channels IS 'Channel that created a row: a first-party client (web, swift, dotnet), a credentialed agent path (api, mcp), or a platform job (system).';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  actor_column TEXT;
  actor_columns TEXT[] := COALESCE(TG_ARGV, ARRAY[]::TEXT[]);
  old_row JSONB;
  new_row JSONB;
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD);
    new_row := to_jsonb(NEW);
    IF (old_row - actor_columns) IS NOT DISTINCT FROM (new_row - actor_columns) THEN
      FOREACH actor_column IN ARRAY actor_columns LOOP
        IF new_row -> actor_column IS DISTINCT FROM old_row -> actor_column
          AND new_row -> actor_column IS DISTINCT FROM 'null'::jsonb THEN
          RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION fn_project_latest_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_id UUID := (to_jsonb(NEW) ->> TG_ARGV[2])::uuid;
  change_filter TEXT := CASE WHEN TG_NARGS = 7 THEN format(' AND %I = %L', TG_ARGV[5], TG_ARGV[6]) ELSE '' END;
BEGIN
  -- Serialize on the target before re-reading the latest committed log entry.
  EXECUTE format('SELECT %I FROM %I.%I WHERE %I = $1 FOR UPDATE',
    TG_ARGV[1], TG_TABLE_SCHEMA, TG_ARGV[0], TG_ARGV[1]) USING target_id;
  EXECUTE format(
    'UPDATE %I.%I target SET %I = latest.value FROM
     (SELECT %I AS value FROM %I.%I WHERE %I = $1%s ORDER BY id DESC LIMIT 1) latest
     WHERE target.%I = $1 AND target.%I IS DISTINCT FROM latest.value',
    TG_TABLE_SCHEMA, TG_ARGV[0], TG_ARGV[3], TG_ARGV[4], TG_TABLE_SCHEMA,
    TG_TABLE_NAME, TG_ARGV[2], change_filter, TG_ARGV[1], TG_ARGV[3]) USING target_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_create_metrics()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('INSERT INTO %I.%I (%I) VALUES ($1) ON CONFLICT (%I) DO NOTHING',
    TG_TABLE_SCHEMA, TG_ARGV[0], TG_ARGV[1], TG_ARGV[1]) USING NEW.id;
  RETURN NEW;
END;
$$;

-- Parent scope is stored solely to express concrete composite foreign keys.
-- Fill it on insertion; the FK also enforces explicit scope and every later UPDATE.
CREATE OR REPLACE FUNCTION fn_update_parent_notice_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE notice_id UUID;
BEGIN
  IF NEW.copyright_notice_id IS NULL THEN
    EXECUTE format('SELECT copyright_notice_id FROM %I.%I WHERE id = $1',
      TG_TABLE_SCHEMA, TG_ARGV[0]) INTO notice_id
      USING (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
    IF notice_id IS NULL AND to_jsonb(NEW) ->> TG_ARGV[1] IS NOT NULL THEN
      RAISE EXCEPTION '% parent % does not exist', TG_TABLE_NAME, TG_ARGV[0]
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    NEW.copyright_notice_id := notice_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Wilson score lower bound function for ranking
CREATE OR REPLACE FUNCTION fn_wilson_score_lower_bound(pos double precision, tot double precision)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN tot IS NULL OR tot <= 0 THEN 0
    ELSE
      (
        (pos/tot + (1.96*1.96)/(2*tot))
        - 1.96 * sqrt(((pos/tot) * (1 - (pos/tot)) + (1.96*1.96)/(4*tot)) / tot)
      )
      / (1 + (1.96*1.96)/tot)
  END
$$;

-- function to update the updated_at column on a table
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_reject_terminal_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
  terminal_column TEXT;
  old_row JSONB := to_jsonb(OLD);
  new_row JSONB := to_jsonb(NEW);
  was_terminal BOOLEAN := FALSE;
BEGIN
  FOREACH terminal_column IN ARRAY TG_ARGV LOOP
    IF old_row -> terminal_column <> 'null'::jsonb THEN
      was_terminal := TRUE;
    END IF;
  END LOOP;

  IF was_terminal THEN
    FOREACH terminal_column IN ARRAY TG_ARGV LOOP
      IF old_row -> terminal_column IS DISTINCT FROM new_row -> terminal_column THEN
        RAISE EXCEPTION '% terminal lifecycle cannot transition after completion', TG_TABLE_NAME
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Spending frequencies enum
DO $$ BEGIN
  CREATE TYPE spending_frequencies AS ENUM (
  'monthly',
  'annually'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Currencies table
CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  CHECK (code ~ '^[a-z]{3}$'),
  minor_unit_exponent SMALLINT NOT NULL,
  CHECK (minor_unit_exponent BETWEEN 0 AND 4)
);

COMMENT ON TABLE currencies IS 'ISO 4217 currency codes supported by the platform.';
COMMENT ON COLUMN currencies.code IS 'Lowercase ISO 4217 three-letter currency code, matching Stripe wire values.';
COMMENT ON COLUMN currencies.minor_unit_exponent IS 'Decimal exponent used to convert major units to the currency minor unit.';

INSERT INTO currencies (code, minor_unit_exponent) VALUES
  ('usd', 2),
  ('cad', 2),
  ('eur', 2),
  ('gbp', 2),
  ('jpy', 0),
  ('aud', 2)
ON CONFLICT (code) DO NOTHING;

-- Sites table
-- site-specific logic is handled at the application layer
CREATE TABLE IF NOT EXISTS sites (
  slug TEXT PRIMARY KEY,
  CHECK (char_length(slug) <= 255),
  CHECK (slug = LOWER(slug)),
  CHECK (slug = TRIM(slug)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE sites IS 'Top-level content sites/verticals. Each site groups topics and content under a slug.';
COMMENT ON COLUMN sites.slug IS 'URL-safe lowercase identifier for the site (e.g. rewards, cars).';

INSERT INTO sites (slug) VALUES
  ('meta'), -- about this site
  ('rewards'),
  ('cars'),
  ('software-engineering'),
  ('artificial-intelligence'),
  ('apple'),
  ('android'),
  ('personal-computers'),
  ('games'),
  ('politics'),
  ('public-policy'),
  ('personal-finance'),
  ('corporate-finance'),
  ('cryptocurrency'),
  ('investing'),
  ('economics'),
  ('business'),
  ('health'),
  ('legal'),
  ('science')
  ;

-- Immutable function to convert text to timestamptz
-- Used for generated columns that extract timestamps from JSONB
-- RSS feeds typically include timezone info (RFC 822 or ISO 8601)
-- If timezone info is missing, defaults to UTC to ensure immutability
-- (session timezone would make this non-immutable)
-- Best-effort: malformed dates (bad offset, unknown weekday, out-of-range TZ) return NULL
-- rather than throwing, so the generated column falls back to uuid_extract_timestamp(id).
CREATE OR REPLACE FUNCTION fn_text_to_timestamptz(text_value TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized TEXT;
BEGIN
  normalized := TRIM(BOTH E'\t\n\r\f ' FROM text_value);
  IF normalized IS NULL OR normalized = '' OR LOWER(normalized) = 'null' THEN
    RETURN NULL;
  END IF;

  -- Strip a known RFC 822 weekday prefix ("Mon, " … "Sun, ").
  -- Anchored to standard abbreviations; non-standard tokens fall through to the exception handler.
  normalized := regexp_replace(normalized, '^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*', '', 'i');
  -- Collapse a named-zone prefix glued to a numeric offset: "GMT-0700" -> "-0700",
  -- "UTC+05:30" -> "+05:30". PostgreSQL rejects the glued form but accepts the bare offset.
  normalized := regexp_replace(normalized, '(?:GMT|UTC)\s*([+-]\d{1,2}:?\d{2})', '\1', 'i');

  IF normalized ~ '[Zz]$' OR
     normalized ~ '[\+\-]\d{1,2}:?\d{2}$' OR
     normalized ~ ' [A-Z]{3,}$' THEN
    RETURN normalized::timestamptz;
  END IF;
  RETURN timezone('UTC', normalized::timestamp);
EXCEPTION
  -- Best-effort parser over untrusted feed input: any value PostgreSQL still can't parse
  -- degrades to NULL so the generated column falls back to uuid_extract_timestamp(id),
  -- rather than aborting the INSERT and the whole fetchRssFeed job. Three distinct SQLSTATE
  -- codes (22023, 22007, 22009) have already appeared from real feeds; a narrow catch would leak.
  WHEN OTHERS THEN
    RAISE WARNING 'fn_text_to_timestamptz: unparseable date "%" (SQLSTATE: %)', text_value, SQLSTATE;
    RETURN NULL;
END;
$$;

-- Text search configuration with diacritic folding for accented names (José, Beyoncé, etc.)
-- unaccent() itself is STABLE, not IMMUTABLE, so it cannot be called directly in an index or
-- generated-column expression. Mapping it as a dictionary inside a text search configuration is
-- fine: to_tsvector(regconfig, text) is IMMUTABLE regardless of which dictionaries the config maps.
DO $$ BEGIN
  CREATE TEXT SEARCH CONFIGURATION voucha_english (COPY = english);
  ALTER TEXT SEARCH CONFIGURATION voucha_english
    ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- array_to_string(anyarray, text) is cataloged STABLE (not IMMUTABLE) because it is polymorphic
-- over anyarray and Postgres can't prove every possible element type's output function is
-- immutable. For the concrete TEXT[] columns this codebase joins into search vectors, that
-- concern doesn't apply, so this wrapper narrows the signature and re-asserts immutability —
-- same precedent as fn_reverse_hostname_labels. Needed so array_to_string can appear inside a
-- GENERATED ALWAYS AS (...) STORED expression.
CREATE OR REPLACE FUNCTION fn_immutable_array_to_string(p_array TEXT[], p_delimiter TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT array_to_string(p_array, p_delimiter)
$$;

-- ============================================================================
-- Countries
-- ============================================================================

CREATE TABLE IF NOT EXISTS countries (
  id SMALLINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code TEXT UNIQUE NOT NULL,
  CHECK (code ~ '^[A-Z]{2}$'),
  CHECK (code = UPPER(code)),
  CHECK (code = TRIM(code)),
  name TEXT NOT NULL,
  CHECK (char_length(name) <= 255),
  CHECK (name = TRIM(name)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_countries_updated_at
BEFORE UPDATE ON countries
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE countries IS 'Lookup table of supported countries with ISO 3166-1 alpha-2 codes.';
COMMENT ON COLUMN countries.code IS 'ISO 3166-1 alpha-2 country code (e.g., US, GB, JP).';
COMMENT ON COLUMN countries.name IS 'Full country name in English.';

INSERT INTO countries (code, name) VALUES
  ('US', 'United States'),
  ('CA', 'Canada'),
  ('GB', 'United Kingdom'),
  ('DE', 'Germany'),
  ('FR', 'France'),
  ('JP', 'Japan'),
  ('AU', 'Australia'),
  ('IN', 'India'),
  ('BR', 'Brazil'),
  ('MX', 'Mexico'),
  ('KR', 'South Korea'),
  ('IT', 'Italy'),
  ('ES', 'Spain'),
  ('NL', 'Netherlands'),
  ('SE', 'Sweden'),
  ('CH', 'Switzerland'),
  ('SG', 'Singapore'),
  ('HK', 'Hong Kong'),
  ('NZ', 'New Zealand'),
  ('TW', 'Taiwan')
ON CONFLICT (code) DO NOTHING;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_field_changes(before_fields JSONB, after_fields JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(field, jsonb_build_object(
    'before', before_fields -> field, 'after', after_fields -> field)), '{}'::jsonb)
  FROM (SELECT jsonb_object_keys(before_fields || after_fields) AS field) fields
  WHERE before_fields -> field IS DISTINCT FROM after_fields -> field
$$;
