-- v2.9.14: 14 particle profile effects (leaves, sakura, snow, hearts, embers …).
INSERT INTO shop_items (id, category, kind, name, description, price_ag, rarity, repeatable, requires, style, effect, sort) VALUES
  ('fx-leaves', 'profile-effects', 'profileEffect', 'Autumn Leaves', 'Falling autumn leaves drift across your profile.', 12, 'epic', FALSE, '{}', '{"kind": "leaves", "colors": ["#f97316", "#dc2626", "#facc15"]}', '{}', 23),
  ('fx-sakura', 'profile-effects', 'profileEffect', 'Sakura', 'Cherry blossom petals float down your profile.', 12, 'epic', FALSE, '{}', '{"kind": "sakura", "colors": ["#fbcfe8", "#f9a8d4", "#fff1f2"]}', '{}', 24),
  ('fx-snow', 'profile-effects', 'profileEffect', 'Snowfall', 'Soft snow falls over your profile.', 8, 'rare', FALSE, '{}', '{"kind": "snow", "colors": ["#f8fafc", "#bae6fd"]}', '{}', 25),
  ('fx-hearts', 'profile-effects', 'profileEffect', 'Hearts', 'Little hearts rise from your profile.', 8, 'rare', FALSE, '{}', '{"kind": "hearts", "colors": ["#fb7185", "#f43f5e", "#fda4af"]}', '{}', 26),
  ('fx-embers', 'profile-effects', 'profileEffect', 'Embers', 'Glowing embers rise like a campfire.', 14, 'epic', FALSE, '{}', '{"kind": "embers", "colors": ["#fb923c", "#f97316", "#fde047"]}', '{}', 27),
  ('fx-bubbles', 'profile-effects', 'profileEffect', 'Bubbles', 'Bubbles float up through your profile.', 6, 'rare', FALSE, '{}', '{"kind": "bubbles", "colors": ["#7dd3fc", "#a5f3fc"]}', '{}', 28),
  ('fx-confetti', 'profile-effects', 'profileEffect', 'Confetti', 'A party of confetti, all the time.', 10, 'epic', FALSE, '{}', '{"kind": "confetti", "colors": ["#f43f5e", "#facc15", "#22d3ee", "#a855f7", "#4ade80"]}', '{}', 29),
  ('fx-coins', 'profile-effects', 'profileEffect', 'Coin Rain', 'Gold coins rain over your profile.', 20, 'legendary', FALSE, '{}', '{"kind": "coins", "colors": ["#facc15", "#fde68a"]}', '{}', 30),
  ('fx-storm', 'profile-effects', 'profileEffect', 'Storm', 'Lightning crackles around your profile.', 18, 'legendary', FALSE, '{}', '{"kind": "storm", "colors": ["#a5f3fc", "#e0f2fe", "#facc15"]}', '{}', 31),
  ('fx-melody', 'profile-effects', 'profileEffect', 'Melody', 'Music notes rise from your profile.', 8, 'rare', FALSE, '{}', '{"kind": "melody", "colors": ["#c4b5fd", "#f0abfc"]}', '{}', 32),
  ('fx-stardust', 'profile-effects', 'profileEffect', 'Stardust', 'Twinkling stars sparkle on your profile.', 14, 'epic', FALSE, '{}', '{"kind": "stardust", "colors": ["#fde68a", "#f8fafc", "#c4b5fd"]}', '{}', 33),
  ('fx-pixels', 'profile-effects', 'profileEffect', 'Pixel Rain', 'Retro pixels rain down your profile.', 10, 'epic', FALSE, '{}', '{"kind": "pixels", "colors": ["#22d3ee", "#a855f7", "#4ade80"]}', '{}', 34),
  ('fx-fireflies', 'profile-effects', 'profileEffect', 'Fireflies', 'Fireflies glow in the dark around you.', 12, 'epic', FALSE, '{}', '{"kind": "fireflies", "colors": ["#d9f99d", "#fde047"]}', '{}', 35),
  ('fx-feathers', 'profile-effects', 'profileEffect', 'Feathers', 'White feathers drift down slowly.', 16, 'legendary', FALSE, '{}', '{"kind": "feathers", "colors": ["#f8fafc", "#e2e8f0"]}', '{}', 36)
ON CONFLICT (id) DO NOTHING;
