-- edited-in-place: pre-launch; every current placement lifecycle uses concrete capacity ownership.
-- no-mistakes-disable-next-line postgres-require-fk-on-delete: explicit NO ACTION DEFERRABLE is required for reciprocal concrete owner/slot relations; actual owner and reservation changes settle in one transaction before commit.
CREATE TABLE image_placement_capacity_reservations (
  placement_id uuid PRIMARY KEY,
  image_id uuid NOT NULL,
  image_capacity_admissible_image_id uuid GENERATED ALWAYS AS (image_id) STORED,
  binding_family image_binding_families NOT NULL CHECK (binding_family IN ('post', 'surface')),
  activation_revision integer NOT NULL CHECK (activation_revision >= 0),
  is_current_image_delivery_eligible boolean NOT NULL,
  slot_number integer NOT NULL CHECK (slot_number BETWEEN 1 AND 1000),
  post_placement_id uuid,
  post_id uuid,
  surface_placement_id uuid,
  has_surface_owner boolean GENERATED ALWAYS AS (
    CASE WHEN surface_placement_id IS NOT NULL THEN true ELSE NULL END
  ) STORED,
  UNIQUE (image_id, slot_number) INCLUDE (placement_id),
  UNIQUE (placement_id, activation_revision),
  UNIQUE (placement_id, is_current_image_delivery_eligible),
  CONSTRAINT fk_image_placement_capacity__live_image FOREIGN KEY (image_capacity_admissible_image_id)
    REFERENCES images (capacity_admissible_image_id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE,
  CHECK (
    (binding_family = 'post' AND post_placement_id = placement_id
      AND post_placement_id IS NOT NULL AND post_id IS NOT NULL AND surface_placement_id IS NULL)
    OR (binding_family = 'surface' AND surface_placement_id = placement_id
      AND surface_placement_id IS NOT NULL AND post_placement_id IS NULL AND post_id IS NULL)
  ),
  FOREIGN KEY (placement_id, image_id, binding_family)
    REFERENCES retained_image_placement_bindings (placement_id, image_id, binding_family)
    ON DELETE RESTRICT,
  FOREIGN KEY (post_placement_id) REFERENCES image_placements (placement_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (post_placement_id, post_id) REFERENCES image_placements (placement_id, post_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (surface_placement_id) REFERENCES image_surface_placements (placement_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_image_placement_capacity__surface_owner
    FOREIGN KEY (surface_placement_id, has_surface_owner)
    REFERENCES image_surface_placements (placement_id, has_live_owner)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_image_placement_capacity__active_generation
    FOREIGN KEY (placement_id, activation_revision)
    REFERENCES media_placements (active_capacity_reservation_placement_id, activation_revision)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_image_placement_capacity__image_policy
    FOREIGN KEY (image_id, is_current_image_delivery_eligible)
    REFERENCES images (id, is_delivery_eligible) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX idx_image_placement_capacity_reservations__post
ON image_placement_capacity_reservations (post_id, placement_id) WHERE post_id IS NOT NULL;

-- no-mistakes-disable-next-line postgres-require-fk-on-delete: the reciprocal actual placement/slot relation must permit ordered owner and reservation writes within the same transaction and reject inconsistent commit.
ALTER TABLE media_placements
ADD CONSTRAINT fk_media_placements__active_capacity_reservation
FOREIGN KEY (active_capacity_reservation_placement_id, activation_revision)
REFERENCES image_placement_capacity_reservations (placement_id, activation_revision)
ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE media_placements VALIDATE CONSTRAINT fk_media_placements__active_capacity_reservation;

-- no-mistakes-disable-next-line postgres-require-fk-on-delete: exact image-policy reservation validation is deferred only through the actual owner SQL phase, then forced IMMEDIATE before edge effects.
ALTER TABLE media_placements
ADD CONSTRAINT fk_media_placements__current_image_policy
FOREIGN KEY (active_capacity_reservation_placement_id, is_current_image_delivery_eligible)
REFERENCES image_placement_capacity_reservations (placement_id, is_current_image_delivery_eligible)
ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE media_placements VALIDATE CONSTRAINT fk_media_placements__current_image_policy;

COMMENT ON TABLE image_placement_capacity_reservations IS 'Concrete active post or surface activation owning one immediately unique image slot; acquisition precedes edge denial and rolls back with the owner mutation.';
COMMENT ON COLUMN image_placement_capacity_reservations.placement_id IS 'Exact retained image placement identity consuming the slot.';
COMMENT ON COLUMN image_placement_capacity_reservations.image_id IS 'Immutable image identity from the retained placement binding.';
COMMENT ON COLUMN image_placement_capacity_reservations.binding_family IS 'Concrete post or surface child family required at commit.';
COMMENT ON COLUMN image_placement_capacity_reservations.activation_revision IS 'Current activation generation, stable across copyright and publication metadata changes.';
COMMENT ON COLUMN image_placement_capacity_reservations.is_current_image_delivery_eligible IS 'Current parent image policy, constrained before edge effects; policy mutation updates the concrete active write set.';
COMMENT ON COLUMN image_placement_capacity_reservations.slot_number IS 'Sparse unique slot; admission claims from the available prefix budget across the hard slot range.';
COMMENT ON COLUMN image_placement_capacity_reservations.post_placement_id IS 'Concrete eventual post child; equals placement_id exactly for post reservations.';
COMMENT ON COLUMN image_placement_capacity_reservations.post_id IS 'Exact hosting post from the concrete child; indexes only the current active placement set, excluding historical bindings.';
COMMENT ON COLUMN image_placement_capacity_reservations.surface_placement_id IS 'Concrete eventual surface child; equals placement_id exactly for surface reservations.';

CREATE INDEX idx_image_placement_capacity_reservations__post_placement_id ON image_placement_capacity_reservations(post_placement_id) WHERE post_placement_id IS NOT NULL;

CREATE INDEX idx_image_placement_capacity_reservations__surface_placement_id ON image_placement_capacity_reservations(surface_placement_id) WHERE surface_placement_id IS NOT NULL;

CREATE INDEX idx_image_placement_capacity_reservations__admissible_image
  ON image_placement_capacity_reservations(image_capacity_admissible_image_id);
COMMENT ON COLUMN image_placement_capacity_reservations.image_capacity_admissible_image_id IS 'Generated projection of the concrete binding image id, referencing the live image capacity authority independently of its retained binding and policy relations.';

COMMENT ON COLUMN image_placement_capacity_reservations.has_surface_owner IS 'Generated concrete surface-owner requirement, null for post reservations; deferred validation permits owner-first removal followed by same-transaction reservation release, while rejecting an ownerless active surface.';
