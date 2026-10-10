-- v2.0 loyalty: Vivace tier above Monarch, faster early curve, per-card daily game Loyalty XP cap.
-- Thresholds only go DOWN for existing cards, so no player is ever demoted.

INSERT INTO loyalty_cards (slug, name, rank, xp_required, max_bet_ac, max_bet_ag, unlock_ac, unlock_ag, color, benefits)
VALUES ('vivace', 'Vivace', 7, 60000000, 1500000000, 100000, NULL, NULL, '#cbd5e1', '[]')
ON CONFLICT (slug) DO NOTHING;

-- EARLY = fast, MID = moderate, HIGH = grind, TOP = prestige.
UPDATE loyalty_cards SET xp_required = v.xp FROM (VALUES ('silver', 2500), ('gold', 15000), ('platinum', 75000), ('infinite', 300000)) AS v(slug, xp)
WHERE loyalty_cards.slug = v.slug AND loyalty_cards.xp_required > v.xp;

-- Daily Loyalty XP from games grows with the card, so the top tiers stay reachable with long-term play.
UPDATE loyalty_cards SET perks = perks || jsonb_build_object('lxpCap', v.cap) FROM (VALUES
  ('none', 5000), ('silver', 6000), ('gold', 8000), ('platinum', 12000), ('infinite', 20000), ('black', 40000), ('monarch', 80000), ('vivace', 120000)
) AS v(slug, cap) WHERE loyalty_cards.slug = v.slug;

UPDATE loyalty_cards SET
  perks = '{"dailyAc": 40000000, "dailyAg": 800, "weeklyAc": 250000000, "weeklyAg": 4000, "convertPct": 2000, "shopDiscount": 35, "lxpPct": 50, "xpPct": 50, "onceTier": "vvip", "onceDays": 365, "lxpCap": 120000}'::jsonb,
  benefits = '["Max bet 1,500,000,000 AC / 100,000 AG (the platform maximum)", "Daily bonus: 40,000,000 AC + 800 AG", "Weekly bonus: 250,000,000 AC + 4,000 AG", "One-time reward: VVIP for 365 days", "21× AC → AG daily limit", "35% off in the Shop", "+50% XP and Loyalty XP", "Vivace concert card, silver tag, clef badge, Vivace name & frame", "Drifting-notes profile effect", "Beyond Monarch: the rarest status in Neon Arcade"]'::jsonb
WHERE slug = 'vivace';

UPDATE loyalty_cards SET benefits = (
  SELECT jsonb_agg(CASE WHEN b #>> '{}' = 'The highest status in Neon Arcade' THEN to_jsonb('Royal status — only Vivace ranks higher'::text) ELSE b END) FROM jsonb_array_elements(benefits) b)
WHERE slug = 'monarch';

INSERT INTO shop_items (id, category, kind, name, description, price_ag, rarity, repeatable, requires, style, effect, sort) VALUES
  ('frame-vivace', 'loyalty', 'frame', 'Vivace Frame', 'Polished silver concert frame for Vivace card holders.', 60, 'legendary', FALSE, '{"card": "vivace"}', '{"color": "#e2e8f0"}', '{}', 86),
  ('name-vivace', 'loyalty', 'nameEffect', 'Vivace Name', 'Silver and white flowing like a melody. Vivace only.', 75, 'legendary', FALSE, '{"card": "vivace"}', '{"colors": ["#f8fafc", "#94a3b8", "#ffffff", "#64748b"]}', '{}', 87),
  ('badge-clef', 'loyalty', 'badge', 'Vivace Clef', 'The treble-clef badge. Vivace card holders only.', 45, 'legendary', FALSE, '{"card": "vivace"}', '{"glyph": "𝄞", "color": "#e2e8f0"}', '{}', 88),
  ('fx-vivace', 'loyalty', 'profileEffect', 'Vivace Notes', 'Silver notes drifting over your profile. Vivace only.', 70, 'legendary', FALSE, '{"card": "vivace"}', '{"kind": "notes", "colors": ["#f8fafc", "#94a3b8"]}', '{}', 89)
ON CONFLICT (id) DO NOTHING;
