-- v2.2 games: Keno, Tower, Cross the Road, Pump (all settled on the server).
INSERT INTO games (slug, name, category, max_multiplier) VALUES
  ('keno', 'Keno', 'originals', 1000), ('tower', 'Tower', 'originals', 1000000),
  ('cross', 'Cross the Road', 'originals', 1000000), ('pump', 'Pump', 'originals', 1000000)
ON CONFLICT (slug) DO NOTHING;
