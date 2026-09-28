-- Published country denials for an allowed placement tuple. Global withholding stores none.
CREATE TABLE media_delivery_registry_denied_countries (
  delivery_key text NOT NULL,
  country_code text NOT NULL,
  PRIMARY KEY (delivery_key, country_code)
);

ALTER TABLE media_delivery_registry_denied_countries
  ADD CONSTRAINT fk_media_delivery_registry_denied_countries__registry
  FOREIGN KEY (delivery_key) REFERENCES media_delivery_registry_records(delivery_key)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE media_delivery_registry_denied_countries
  VALIDATE CONSTRAINT fk_media_delivery_registry_denied_countries__registry;

ALTER TABLE media_delivery_registry_denied_countries
  ADD CONSTRAINT fk_media_delivery_registry_denied_countries__country
  FOREIGN KEY (country_code) REFERENCES countries(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE media_delivery_registry_denied_countries
  VALIDATE CONSTRAINT fk_media_delivery_registry_denied_countries__country;

CREATE INDEX idx_media_delivery_registry_denied_countries__country
  ON media_delivery_registry_denied_countries (country_code);

COMMENT ON TABLE media_delivery_registry_denied_countries IS
  'Countries where an allowed image placement is denied. Empty means the allow is not country-restricted.';
COMMENT ON COLUMN media_delivery_registry_denied_countries.delivery_key IS
  'Exact image-placement delivery tuple whose country set this row belongs to.';
COMMENT ON COLUMN media_delivery_registry_denied_countries.country_code IS
  'ISO 3166-1 alpha-2 country from the supported country lookup.';
