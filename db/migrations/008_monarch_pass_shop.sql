-- Monarch card, much stronger card perks (weekly bonus, XP bonus, one-time membership rewards),
-- new Shop items and battle-pass exclusive cosmetics.

INSERT INTO loyalty_cards (slug, name, rank, xp_required, max_bet_ac, max_bet_ag, unlock_ac, unlock_ag, color, benefits)
VALUES ('monarch', 'Monarch', 6, 25000000, 750000000, 50000, NULL, NULL, '#7f1d1d', '[]')
ON CONFLICT (slug) DO NOTHING;

-- perks: daily / weekly card bonus, converter %, Shop discount %, Loyalty XP %, game XP %,
-- and a one-time membership reward when the card is first reached with Loyalty XP.
UPDATE loyalty_cards SET perks = v.perks::jsonb, benefits = v.benefits::jsonb FROM (VALUES
  ('none',     '{"dailyAc": 0, "dailyAg": 0, "weeklyAc": 0, "weeklyAg": 0, "convertPct": 0, "shopDiscount": 0, "lxpPct": 0, "xpPct": 0}',
               '["Max bet 250,000 AC / 10 AG", "Basic chat tag"]'),
  ('silver',   '{"dailyAc": 10000, "dailyAg": 0, "weeklyAc": 50000, "weeklyAg": 2, "convertPct": 25, "shopDiscount": 3, "lxpPct": 5, "xpPct": 5}',
               '["Max bet 500,000 AC / 20 AG", "Daily bonus: 10,000 AC", "Weekly bonus: 50,000 AC + 2 AG", "+25% AC → AG daily limit", "3% off in the Shop", "+5% XP and Loyalty XP", "Silver badge, chat tag & emotes"]'),
  ('gold',     '{"dailyAc": 50000, "dailyAg": 2, "weeklyAc": 250000, "weeklyAg": 10, "convertPct": 50, "shopDiscount": 5, "lxpPct": 10, "xpPct": 10}',
               '["Max bet 1,000,000 AC / 50 AG", "Daily bonus: 50,000 AC + 2 AG", "Weekly bonus: 250,000 AC + 10 AG", "+50% AC → AG daily limit", "5% off in the Shop", "+10% XP and Loyalty XP", "Gold badge, chat tag, emotes & frame"]'),
  ('platinum', '{"dailyAc": 150000, "dailyAg": 5, "weeklyAc": 1000000, "weeklyAg": 25, "convertPct": 100, "shopDiscount": 10, "lxpPct": 15, "xpPct": 15, "onceTier": "vip", "onceDays": 7}',
               '["Max bet 2,500,000 AC / 125 AG", "Daily bonus: 150,000 AC + 5 AG", "Weekly bonus: 1,000,000 AC + 25 AG", "One-time reward: VIP for 7 days", "2× AC → AG daily limit", "10% off in the Shop", "+15% XP and Loyalty XP", "Platinum name & cosmetics"]'),
  ('infinite', '{"dailyAc": 500000, "dailyAg": 15, "weeklyAc": 3500000, "weeklyAg": 75, "convertPct": 200, "shopDiscount": 15, "lxpPct": 20, "xpPct": 20, "onceTier": "vip", "onceDays": 30}',
               '["Max bet 8,500,000 AC / 350 AG", "Daily bonus: 500,000 AC + 15 AG", "Weekly bonus: 3,500,000 AC + 75 AG", "One-time reward: VIP for 30 days", "3× AC → AG daily limit", "15% off in the Shop", "+20% XP and Loyalty XP", "Infinite cosmetics & profile effects"]'),
  ('black',    '{"dailyAc": 2000000, "dailyAg": 40, "weeklyAc": 12000000, "weeklyAg": 200, "convertPct": 400, "shopDiscount": 20, "lxpPct": 25, "xpPct": 25, "onceTier": "vvip", "onceDays": 14}',
               '["Max bet 20,000,000 AC / 750 AG", "Daily bonus: 2,000,000 AC + 40 AG", "Weekly bonus: 12,000,000 AC + 200 AG", "One-time reward: VVIP for 14 days", "5× AC → AG daily limit", "20% off in the Shop", "+25% XP and Loyalty XP", "Black card glow & unique effects"]'),
  ('monarch',  '{"dailyAc": 15000000, "dailyAg": 300, "weeklyAc": 100000000, "weeklyAg": 1500, "convertPct": 1000, "shopDiscount": 30, "lxpPct": 40, "xpPct": 40, "onceTier": "vvip", "onceDays": 180}',
               '["Max bet 750,000,000 AC / 50,000 AG", "Daily bonus: 15,000,000 AC + 300 AG", "Weekly bonus: 100,000,000 AC + 1,500 AG", "One-time reward: VVIP for 180 days", "11× AC → AG daily limit", "30% off in the Shop", "+40% XP and Loyalty XP", "Monarch crown, name, frame & royal effects", "The highest status in Neon Arcade"]')
) AS v(slug, perks, benefits) WHERE loyalty_cards.slug = v.slug;

-- ── Shop: stronger boosts and new cosmetics ──
INSERT INTO shop_items (id, category, kind, name, description, price_ag, rarity, repeatable, requires, style, effect, sort) VALUES
  ('mega-lucky', 'boosts', 'boost', 'Mega Lucky', '+100% XP from every round for 2 hours. Game results are not affected.', 12, 'epic', TRUE, '{}', '{"glyph": "🌟", "color": "#fde047"}', '{"type": "xp", "mult": 2, "minutes": 120}', 4),
  ('loyalty-overdrive', 'boosts', 'boost', 'Loyalty Overdrive', '+60% Loyalty XP for 3 hours. Climb the cards faster.', 18, 'legendary', TRUE, '{}', '{"glyph": "🚀", "color": "#c084fc"}', '{"type": "lxp", "mult": 1.6, "minutes": 180}', 5),
  ('triple-daily', 'boosts', 'boost', 'Triple Daily', 'Your next daily reward pays out three times.', 9, 'epic', TRUE, '{}', '{"glyph": "🎉", "color": "#fb923c"}', '{"type": "daily", "mult": 3, "uses": 1}', 6),
  ('fx-inferno', 'profile-effects', 'profileEffect', 'Inferno', 'Flames of crimson and gold rolling across your banner.', 18, 'legendary', FALSE, '{}', '{"kind": "aurora", "colors": ["#f97316", "#dc2626", "#facc15"]}', '{}', 23),
  ('fx-matrix', 'profile-effects', 'profileEffect', 'Matrix Scan', 'A green code scan over your profile.', 9, 'epic', FALSE, '{}', '{"kind": "scan", "colors": ["#4ade80", "#16a34a"]}', '{}', 24),
  ('chat-royal', 'chat-effects', 'chatEffect', 'Royal Chat', 'An animated gold-and-crimson edge on your messages.', 16, 'legendary', FALSE, '{}', '{"color": "#facc15", "color2": "#dc2626", "animated": true}', '{}', 33),
  ('chat-frost', 'chat-effects', 'chatEffect', 'Frost Chat', 'An icy animated edge on your messages.', 10, 'epic', FALSE, '{}', '{"color": "#a5f3fc", "color2": "#60a5fa", "animated": true}', '{}', 34),
  ('name-aurora', 'name-effects', 'nameEffect', 'Aurora Name', 'Northern-light colors flowing through your name.', 10, 'epic', FALSE, '{}', '{"colors": ["#34d399", "#22d3ee", "#a78bfa", "#34d399"]}', '{}', 44),
  ('name-toxic', 'name-effects', 'nameEffect', 'Toxic Name', 'Radioactive green with a glitch.', 14, 'epic', FALSE, '{}', '{"colors": ["#a3e635", "#22c55e", "#a3e635"], "glitch": true}', '{}', 45),
  ('theme-crimson', 'themes', 'theme', 'Crimson Court', 'Deep red and gold profile theme.', 9, 'rare', FALSE, '{}', '{"colors": ["#7f1d1d", "#1c0a0a"], "accent": "#fbbf24"}', '{}', 53),
  ('theme-cyber', 'themes', 'theme', 'Cyber Gold', 'Black and electric gold profile theme.', 9, 'rare', FALSE, '{}', '{"colors": ["#422006", "#09090b"], "accent": "#facc15"}', '{}', 54),
  ('badge-diamond', 'badges', 'badge', 'Diamond Hands', 'A diamond badge next to your name.', 12, 'epic', FALSE, '{}', '{"glyph": "💎", "color": "#67e8f9"}', '{}', 63),
  ('badge-bolt', 'badges', 'badge', 'Lightning', 'A lightning badge next to your name.', 7, 'rare', FALSE, '{}', '{"glyph": "⚡", "color": "#fde047"}', '{}', 64),
  ('frame-holo', 'cosmetics', 'frame', 'Holo Frame', 'A holographic avatar frame.', 16, 'legendary', FALSE, '{}', '{"color": "#e879f9"}', '{}', 73),
  ('frame-plasma', 'cosmetics', 'frame', 'Plasma Frame', 'Electric cyan avatar frame.', 10, 'epic', FALSE, '{}', '{"color": "#22d3ee"}', '{}', 74),
  ('frame-monarch', 'loyalty', 'frame', 'Monarch Frame', 'Crimson-gold crown frame for Monarch card holders.', 40, 'legendary', FALSE, '{"card": "monarch"}', '{"color": "#b91c1c"}', '{}', 83),
  ('name-monarch', 'loyalty', 'nameEffect', 'Monarch Name', 'A royal crimson name that glitches with power. Monarch only.', 50, 'legendary', FALSE, '{"card": "monarch"}', '{"colors": ["#fecaca", "#b91c1c", "#fbbf24", "#b91c1c"], "glitch": true}', '{}', 84),
  ('badge-crown', 'loyalty', 'badge', 'Monarch Crown', 'The crown badge. Monarch card holders only.', 30, 'legendary', FALSE, '{"card": "monarch"}', '{"glyph": "♛", "color": "#fbbf24"}', '{}', 85)
ON CONFLICT (id) DO NOTHING;

-- Battle-pass exclusives: never sold (inactive), only earned from the pass.
INSERT INTO shop_items (id, category, kind, name, description, price_ag, rarity, active, requires, style, effect, sort) VALUES
  ('pass-badge', 'event', 'badge', 'Season Badge', 'Battle pass badge. Free track, tier 10.', 0, 'rare', FALSE, '{}', '{"glyph": "✪", "color": "#22d3ee"}', '{}', 300),
  ('pass-theme', 'event', 'theme', 'Season Theme', 'Battle pass profile theme. Free track, tier 30.', 0, 'epic', FALSE, '{}', '{"colors": ["#0e7490", "#0b1020"], "accent": "#67e8f9"}', '{}', 301),
  ('pass-frame', 'event', 'frame', 'Season Frame', 'Battle pass avatar frame. Premium track.', 0, 'epic', FALSE, '{}', '{"color": "#38bdf8"}', '{}', 302),
  ('pass-name', 'event', 'nameEffect', 'Season Name', 'Battle pass name effect. Premium track.', 0, 'legendary', FALSE, '{}', '{"colors": ["#22d3ee", "#e879f9", "#facc15", "#22d3ee"]}', '{}', 303),
  ('pass-chat', 'event', 'chatEffect', 'Season Chat', 'Battle pass chat effect. Premium track.', 0, 'legendary', FALSE, '{}', '{"color": "#22d3ee", "color2": "#e879f9", "animated": true}', '{}', 304),
  ('pass-fx', 'event', 'profileEffect', 'Season Aurora', 'Battle pass profile effect. Premium track.', 0, 'legendary', FALSE, '{}', '{"kind": "aurora", "colors": ["#22d3ee", "#e879f9", "#facc15"]}', '{}', 305),
  ('pass-crown', 'event', 'badge', 'Season Champion', 'Reached the end of the premium track.', 0, 'legendary', FALSE, '{}', '{"glyph": "♔", "color": "#facc15"}', '{}', 306)
ON CONFLICT (id) DO NOTHING;
