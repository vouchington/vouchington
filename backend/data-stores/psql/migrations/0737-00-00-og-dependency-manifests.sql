-- Explicit OG dependency manifests. Each entry is a placement the rendered card may embed.
CREATE TABLE og_dependency_manifests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE og_dependency_manifest_placements (
  manifest_id uuid NOT NULL REFERENCES og_dependency_manifests (id) ON DELETE RESTRICT,
  placement_id uuid NOT NULL,
  image_id uuid NOT NULL,
  placement_revision integer NOT NULL CHECK (placement_revision >= 0),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (manifest_id, ordinal),
  UNIQUE (manifest_id, placement_id)
);

CREATE INDEX idx_og_dependency_manifest_placements__placement
  ON og_dependency_manifest_placements (placement_id);

CREATE INDEX idx_og_dependency_manifest_placements__image
  ON og_dependency_manifest_placements (image_id);

ALTER TABLE og_dependency_manifest_placements
  ADD CONSTRAINT fk_og_dependency_manifest_placements__placement
  FOREIGN KEY (placement_id) REFERENCES media_placements (id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE og_dependency_manifest_placements
  VALIDATE CONSTRAINT fk_og_dependency_manifest_placements__placement;

ALTER TABLE og_dependency_manifest_placements
  ADD CONSTRAINT fk_og_dependency_manifest_placements__image
  FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE og_dependency_manifest_placements
  VALIDATE CONSTRAINT fk_og_dependency_manifest_placements__image;

COMMENT ON TABLE og_dependency_manifests IS
  'Registered set of placement dependencies for one OG render. Unknown manifests are not delivery authority.';
COMMENT ON TABLE og_dependency_manifest_placements IS
  'One source placement embedded by an OG manifest. Authorization uses the recorded revision, not a later sibling.';
COMMENT ON COLUMN og_dependency_manifest_placements.placement_revision IS
  'Placement revision observed at registration. A later revision does not satisfy this dependency.';
