-- Typed one-to-one data-point facts. The API structured_data object is reconstructed;
-- topic order stays on post_data_point_topics.
CREATE TABLE IF NOT EXISTS post_data_point_facts (
  post_id UUID NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('credit_card', 'bank_account')),
  schema_version SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  result TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('usd', 'cad', 'eur', 'gbp', 'aud', 'jpy')),
  credit_score_range TEXT,
  credit_score_range_presence TEXT NOT NULL DEFAULT 'absent',
  stated_income_range_presence TEXT NOT NULL DEFAULT 'absent',
  stated_income_minimum_amount BIGINT,
  stated_income_minimum_currency TEXT,
  stated_income_maximum_presence TEXT,
  stated_income_maximum_amount BIGINT,
  stated_income_maximum_currency TEXT,
  existing_relationship BOOLEAN,
  hard_inquiries_12m INTEGER,
  hard_inquiries_12m_presence TEXT NOT NULL DEFAULT 'absent',
  cards_opened_24m INTEGER,
  cards_opened_24m_presence TEXT NOT NULL DEFAULT 'absent',
  credit_limit_amount BIGINT,
  credit_limit_currency TEXT,
  credit_limit_presence TEXT NOT NULL DEFAULT 'absent',
  total_credit_limit_amount BIGINT,
  total_credit_limit_currency TEXT,
  total_credit_limit_presence TEXT NOT NULL DEFAULT 'absent',
  years_of_credit_history INTEGER,
  years_of_credit_history_presence TEXT NOT NULL DEFAULT 'absent',
  is_business_application BOOLEAN,
  application_method TEXT,
  application_method_presence TEXT NOT NULL DEFAULT 'absent',
  application_date DATE,
  application_date_presence TEXT NOT NULL DEFAULT 'absent',
  account_type TEXT,
  account_type_presence TEXT NOT NULL DEFAULT 'absent',
  bonus_amount BIGINT,
  bonus_currency TEXT,
  bonus_amount_presence TEXT NOT NULL DEFAULT 'absent',
  bonus_requirements TEXT,
  bonus_requirements_presence TEXT NOT NULL DEFAULT 'absent',
  minimum_balance_amount BIGINT,
  minimum_balance_currency TEXT,
  minimum_balance_presence TEXT NOT NULL DEFAULT 'absent',
  direct_deposit_setup BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id),
  CONSTRAINT post_data_point_facts_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_data_point_facts_hard_inquiries_12m_check
    CHECK (hard_inquiries_12m IS NULL OR hard_inquiries_12m >= 0),
  CONSTRAINT post_data_point_facts_cards_opened_24m_check
    CHECK (cards_opened_24m IS NULL OR cards_opened_24m >= 0),
  CONSTRAINT post_data_point_facts_years_of_credit_history_check
    CHECK (years_of_credit_history IS NULL OR years_of_credit_history BETWEEN 0 AND 100),
  CONSTRAINT post_data_point_facts_credit_limit_amount_check
    CHECK (credit_limit_amount IS NULL OR credit_limit_amount BETWEEN 0 AND 9007199254740991),
  CONSTRAINT post_data_point_facts_total_credit_limit_amount_check
    CHECK (
      total_credit_limit_amount IS NULL
      OR total_credit_limit_amount BETWEEN 0 AND 9007199254740991
    ),
  CONSTRAINT post_data_point_facts_stated_income_minimum_amount_check
    CHECK (
      stated_income_minimum_amount IS NULL
      OR stated_income_minimum_amount BETWEEN 0 AND 9007199254740991
    ),
  CONSTRAINT post_data_point_facts_stated_income_maximum_amount_check
    CHECK (
      stated_income_maximum_amount IS NULL
      OR stated_income_maximum_amount BETWEEN 0 AND 9007199254740991
    ),
  CONSTRAINT post_data_point_facts_bonus_amount_check
    CHECK (bonus_amount IS NULL OR bonus_amount BETWEEN 0 AND 9007199254740991),
  CONSTRAINT post_data_point_facts_minimum_balance_amount_check
    CHECK (minimum_balance_amount IS NULL OR minimum_balance_amount BETWEEN 0 AND 9007199254740991),
  CONSTRAINT post_data_point_facts_bonus_requirements_check
    CHECK (bonus_requirements IS NULL OR char_length(bonus_requirements) <= 500)
) PARTITION BY RANGE (post_id);

CREATE INDEX IF NOT EXISTS idx_post_data_point_facts__result
  ON post_data_point_facts (result);

CREATE INDEX IF NOT EXISTS idx_post_data_point_facts__credit_score_range
  ON post_data_point_facts (credit_score_range)
  WHERE credit_score_range_presence = 'present';

CREATE OR REPLACE TRIGGER trigger_post_data_point_facts_updated_at
BEFORE UPDATE ON post_data_point_facts
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE post_data_point_facts IS 'One typed fact row per data-point post. Presence absent omits the API key, null stores JSON null, and present stores the typed value.';
COMMENT ON COLUMN post_data_point_facts.vertical IS 'Must equal posts.data_point_vertical. Credit-card and bank-account fields are mutually exclusive.';
COMMENT ON COLUMN post_data_point_facts.credit_score_range_presence IS 'absent omits the key, null stores JSON null, present stores credit_score_range. Credit-card facts require present.';

CREATE OR REPLACE FUNCTION fn_data_point_presence_ok(presence TEXT, value_is_null BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT presence IN ('absent', 'null', 'present')
    AND (presence = 'present') IS NOT DISTINCT FROM (NOT value_is_null);
$$;

CREATE OR REPLACE FUNCTION fn_data_point_money_ok(
  presence TEXT,
  amount BIGINT,
  money_currency TEXT,
  parent_currency TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN presence IN ('absent', 'null') THEN amount IS NULL AND money_currency IS NULL
    WHEN presence = 'present' THEN amount IS NOT NULL
      AND amount BETWEEN 0 AND 9007199254740991
      AND money_currency = parent_currency
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION fn_data_point_money_range_ok(
  presence TEXT,
  minimum_amount BIGINT,
  minimum_currency TEXT,
  maximum_presence TEXT,
  maximum_amount BIGINT,
  maximum_currency TEXT,
  parent_currency TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN presence IN ('absent', 'null') THEN minimum_amount IS NULL
      AND minimum_currency IS NULL
      AND maximum_presence IS NULL
      AND maximum_amount IS NULL
      AND maximum_currency IS NULL
    WHEN presence = 'present' THEN minimum_amount IS NOT NULL
      AND minimum_amount BETWEEN 0 AND 9007199254740991
      AND minimum_currency = parent_currency
      AND (
        (
          maximum_presence = 'null'
          AND maximum_amount IS NULL
          AND maximum_currency IS NULL
        )
        OR (
          maximum_presence = 'present'
          AND maximum_amount IS NOT NULL
          AND maximum_amount BETWEEN 0 AND 9007199254740991
          AND maximum_currency = parent_currency
        )
      )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_post_data_point_fact_shape()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT fn_data_point_presence_ok(NEW.credit_score_range_presence, NEW.credit_score_range IS NULL)
    OR NOT fn_data_point_presence_ok(NEW.hard_inquiries_12m_presence, NEW.hard_inquiries_12m IS NULL)
    OR NOT fn_data_point_presence_ok(NEW.cards_opened_24m_presence, NEW.cards_opened_24m IS NULL)
    OR NOT fn_data_point_presence_ok(
      NEW.years_of_credit_history_presence, NEW.years_of_credit_history IS NULL
    )
    OR NOT fn_data_point_presence_ok(NEW.application_method_presence, NEW.application_method IS NULL)
    OR NOT fn_data_point_presence_ok(NEW.application_date_presence, NEW.application_date IS NULL)
    OR NOT fn_data_point_presence_ok(NEW.account_type_presence, NEW.account_type IS NULL)
    OR NOT fn_data_point_presence_ok(
      NEW.bonus_requirements_presence, NEW.bonus_requirements IS NULL
    )
    OR NOT fn_data_point_money_ok(
      NEW.credit_limit_presence, NEW.credit_limit_amount, NEW.credit_limit_currency, NEW.currency
    )
    OR NOT fn_data_point_money_ok(
      NEW.total_credit_limit_presence,
      NEW.total_credit_limit_amount,
      NEW.total_credit_limit_currency,
      NEW.currency
    )
    OR NOT fn_data_point_money_ok(
      NEW.bonus_amount_presence, NEW.bonus_amount, NEW.bonus_currency, NEW.currency
    )
    OR NOT fn_data_point_money_ok(
      NEW.minimum_balance_presence,
      NEW.minimum_balance_amount,
      NEW.minimum_balance_currency,
      NEW.currency
    )
    OR NOT fn_data_point_money_range_ok(
      NEW.stated_income_range_presence,
      NEW.stated_income_minimum_amount,
      NEW.stated_income_minimum_currency,
      NEW.stated_income_maximum_presence,
      NEW.stated_income_maximum_amount,
      NEW.stated_income_maximum_currency,
      NEW.currency
    )
  THEN
    RAISE EXCEPTION 'data point fact presence does not match its typed value'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.credit_score_range_presence = 'present'
    AND NEW.credit_score_range NOT IN ('300-579', '580-669', '670-739', '740-799', '800-850')
  THEN
    RAISE EXCEPTION 'data point credit_score_range is invalid' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.application_method_presence = 'present'
    AND NEW.application_method NOT IN ('online', 'in_branch', 'phone', 'pre_approved')
  THEN
    RAISE EXCEPTION 'data point application_method is invalid' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.account_type_presence = 'present'
    AND NEW.account_type NOT IN ('checking', 'savings', 'cd', 'money_market')
  THEN
    RAISE EXCEPTION 'data point account_type is invalid' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.vertical = 'credit_card' THEN
    IF NEW.result NOT IN (
      'approved', 'denied', 'pending', 'counter_offer', 'retention_offer', 'sign_up_bonus', 'offer'
    ) OR NEW.credit_score_range_presence <> 'present'
      OR NEW.account_type_presence <> 'absent'
      OR NEW.bonus_amount_presence <> 'absent'
      OR NEW.bonus_requirements_presence <> 'absent'
      OR NEW.minimum_balance_presence <> 'absent'
      OR NEW.direct_deposit_setup IS NOT NULL
    THEN
      RAISE EXCEPTION 'credit card data point facts are inconsistent'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.vertical = 'bank_account' THEN
    IF NEW.result NOT IN ('approved', 'denied', 'sign_up_bonus', 'offer')
      OR NEW.hard_inquiries_12m_presence <> 'absent'
      OR NEW.cards_opened_24m_presence <> 'absent'
      OR NEW.credit_limit_presence <> 'absent'
      OR NEW.total_credit_limit_presence <> 'absent'
      OR NEW.years_of_credit_history_presence <> 'absent'
      OR NEW.is_business_application IS NOT NULL
      OR NEW.application_method_presence <> 'absent'
    THEN
      RAISE EXCEPTION 'bank account data point facts are inconsistent'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'data point vertical is invalid' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_post_data_point_facts_shape
BEFORE INSERT OR UPDATE ON post_data_point_facts
FOR EACH ROW EXECUTE FUNCTION fn_guard_post_data_point_fact_shape();

CREATE OR REPLACE FUNCTION fn_assert_post_data_point_vertical_facts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  facts_vertical TEXT;
BEGIN
  IF NEW.data_point_vertical IS NULL THEN
    IF EXISTS (SELECT 1 FROM post_data_point_facts WHERE post_id = NEW.id) THEN
      RAISE EXCEPTION 'data point facts require posts.data_point_vertical'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END IF;
  IF NEW.post_type <> 'data_point' THEN
    RAISE EXCEPTION 'data_point_vertical requires post_type data_point'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT vertical INTO facts_vertical FROM post_data_point_facts WHERE post_id = NEW.id;
  IF facts_vertical IS DISTINCT FROM NEW.data_point_vertical THEN
    RAISE EXCEPTION 'data point facts must match posts.data_point_vertical'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_assert_data_point_facts_agree()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  live_post_type post_types;
  live_vertical TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT post_type, data_point_vertical INTO live_post_type, live_vertical
    FROM posts WHERE id = OLD.post_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    IF live_vertical IS NOT NULL THEN
      RAISE EXCEPTION 'cannot delete data point facts while posts.data_point_vertical is set'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END IF;

  SELECT post_type, data_point_vertical INTO live_post_type, live_vertical
  FROM posts WHERE id = NEW.post_id;
  IF live_post_type IS DISTINCT FROM 'data_point'::post_types
    OR live_vertical IS DISTINCT FROM NEW.vertical
  THEN
    RAISE EXCEPTION 'data point facts must agree with post type and data_point_vertical'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trigger_posts_data_point_facts_agree
AFTER INSERT OR UPDATE OF data_point_vertical, post_type ON posts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_assert_post_data_point_vertical_facts();

CREATE CONSTRAINT TRIGGER trigger_post_data_point_facts_agree
AFTER INSERT OR UPDATE OR DELETE ON post_data_point_facts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_assert_data_point_facts_agree();

CREATE OR REPLACE FUNCTION fn_jsonb_optional_text(field_name TEXT, presence TEXT, value TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE presence
    WHEN 'absent' THEN '{}'::jsonb
    WHEN 'null' THEN jsonb_build_object(field_name, NULL)
    ELSE jsonb_build_object(field_name, value)
  END;
$$;

CREATE OR REPLACE FUNCTION fn_jsonb_optional_int(field_name TEXT, presence TEXT, value BIGINT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE presence
    WHEN 'absent' THEN '{}'::jsonb
    WHEN 'null' THEN jsonb_build_object(field_name, NULL)
    ELSE jsonb_build_object(field_name, value)
  END;
$$;

CREATE OR REPLACE FUNCTION fn_jsonb_optional_money(
  field_name TEXT,
  presence TEXT,
  amount BIGINT,
  money_currency TEXT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE presence
    WHEN 'absent' THEN '{}'::jsonb
    WHEN 'null' THEN jsonb_build_object(field_name, NULL)
    ELSE jsonb_build_object(
      field_name, jsonb_build_object('amount', amount, 'currency', money_currency)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION fn_jsonb_optional_money_range(
  field_name TEXT,
  presence TEXT,
  minimum_amount BIGINT,
  minimum_currency TEXT,
  maximum_presence TEXT,
  maximum_amount BIGINT,
  maximum_currency TEXT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE presence
    WHEN 'absent' THEN '{}'::jsonb
    WHEN 'null' THEN jsonb_build_object(field_name, NULL)
    ELSE jsonb_build_object(
      field_name,
      jsonb_build_object(
        'minimum', jsonb_build_object('amount', minimum_amount, 'currency', minimum_currency),
        'maximum', CASE
          WHEN maximum_presence = 'null' THEN NULL
          ELSE jsonb_build_object('amount', maximum_amount, 'currency', maximum_currency)
        END
      )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION fn_jsonb_optional_boolean(field_name TEXT, value BOOLEAN)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object(field_name, value)
  END;
$$;

CREATE OR REPLACE FUNCTION fn_post_structured_data(target_post_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN facts.post_id IS NULL THEN NULL
    ELSE jsonb_build_object(
      'vertical', facts.vertical,
      'schema_version', facts.schema_version,
      'topic_ids', COALESCE((
        SELECT jsonb_agg(membership.topic_id ORDER BY membership.order_index)
        FROM post_data_point_topics membership
        WHERE membership.post_id = facts.post_id
      ), '[]'::jsonb),
      'result', facts.result,
      'currency', facts.currency
    )
    || fn_jsonb_optional_text(
      'credit_score_range', facts.credit_score_range_presence, facts.credit_score_range
    )
    || fn_jsonb_optional_money_range(
      'stated_income_range',
      facts.stated_income_range_presence,
      facts.stated_income_minimum_amount,
      facts.stated_income_minimum_currency,
      facts.stated_income_maximum_presence,
      facts.stated_income_maximum_amount,
      facts.stated_income_maximum_currency
    )
    || fn_jsonb_optional_boolean('existing_relationship', facts.existing_relationship)
    || fn_jsonb_optional_int(
      'hard_inquiries_12m', facts.hard_inquiries_12m_presence, facts.hard_inquiries_12m
    )
    || fn_jsonb_optional_int(
      'cards_opened_24m', facts.cards_opened_24m_presence, facts.cards_opened_24m
    )
    || fn_jsonb_optional_money(
      'credit_limit',
      facts.credit_limit_presence,
      facts.credit_limit_amount,
      facts.credit_limit_currency
    )
    || fn_jsonb_optional_money(
      'total_credit_limit_all_cards',
      facts.total_credit_limit_presence,
      facts.total_credit_limit_amount,
      facts.total_credit_limit_currency
    )
    || fn_jsonb_optional_int(
      'years_of_credit_history',
      facts.years_of_credit_history_presence,
      facts.years_of_credit_history
    )
    || fn_jsonb_optional_boolean('is_business_application', facts.is_business_application)
    || fn_jsonb_optional_text(
      'application_method', facts.application_method_presence, facts.application_method
    )
    || fn_jsonb_optional_text(
      'application_date',
      facts.application_date_presence,
      to_char(facts.application_date, 'YYYY-MM-DD')
    )
    || fn_jsonb_optional_text('account_type', facts.account_type_presence, facts.account_type)
    || fn_jsonb_optional_money(
      'bonus_amount', facts.bonus_amount_presence, facts.bonus_amount, facts.bonus_currency
    )
    || fn_jsonb_optional_text(
      'bonus_requirements', facts.bonus_requirements_presence, facts.bonus_requirements
    )
    || fn_jsonb_optional_money(
      'minimum_balance_requirement',
      facts.minimum_balance_presence,
      facts.minimum_balance_amount,
      facts.minimum_balance_currency
    )
    || fn_jsonb_optional_boolean('direct_deposit_setup', facts.direct_deposit_setup)
  END
  FROM post_data_point_facts facts
  WHERE facts.post_id = target_post_id;
$$;

COMMENT ON FUNCTION fn_post_structured_data(UUID) IS 'Reconstructs the public data-point structured_data object, including topic_ids ordered by post_data_point_topics.order_index.';
