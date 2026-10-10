-- v2.3 games: Tarot and Sweet (tumble slot), settled on the server.
INSERT INTO games (slug, name, category, max_multiplier) VALUES
  ('tarot', 'Tarot', 'originals', 110), ('sweet', 'Sweet', 'slots', 5000)
ON CONFLICT (slug) DO NOTHING;
