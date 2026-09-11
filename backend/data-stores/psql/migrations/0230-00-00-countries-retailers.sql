-- Coalesced pre-launch domain baseline.
-- Merged from: 0230-00-00-retailer-countries.sql

-- ==========================================================================
-- 0230-00-00-retailer-countries.sql
-- ============================================================================

-- ============================================================================
-- Retailer Countries
-- ============================================================================

CREATE TABLE IF NOT EXISTS retailer_countries (
  retailer_id UUID NOT NULL REFERENCES topics__retailers ON DELETE CASCADE,
  country_id SMALLINT NOT NULL REFERENCES countries ON DELETE CASCADE,
  PRIMARY KEY (retailer_id, country_id)
);

COMMENT ON TABLE retailer_countries IS 'Junction table mapping retailers to the countries they operate in.';
COMMENT ON COLUMN retailer_countries.retailer_id IS 'The retailer topic.';
COMMENT ON COLUMN retailer_countries.country_id IS 'The country the retailer operates in.';
