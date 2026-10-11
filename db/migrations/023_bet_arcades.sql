-- v2.9.12: Slice, Moles, Layer and Snake become server-settled bet games (Slice/Moles/Layer on the ladder engine, Snake = dice board).
INSERT INTO games (slug, name, category, max_multiplier) VALUES
  ('slice', 'Slice', 'originals', 1000000), ('moles', 'Moles', 'originals', 1000000),
  ('layer', 'Layer', 'originals', 1000000), ('snake', 'Snake', 'originals', 1000000)
ON CONFLICT (slug) DO NOTHING;
