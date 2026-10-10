-- v2.1 reward rebalance: one smooth curve across every card.
--   * Each card is ~2.5x the previous one (max bet, bonuses). The old Black -> Monarch jump (37x max bet, 25x XP) is gone.
--   * Daily bonus ~= 2% of the card's max bet; weekly = 5x daily; NEW monthly = 15x daily.
--   * AG bonuses are worth ~25% of the AC part (1 AG = 25,000 AC), so gems stay rare.
--   * XP thresholds only go DOWN (LEAST), so no player is ever demoted.
-- Days to the next card at the daily game Loyalty XP cap: ~1, 2, 6, 14, 25, 56, 100.

UPDATE loyalty_cards SET xp_required = LEAST(xp_required, v.xp) FROM (VALUES
  ('silver', 2500), ('gold', 12000), ('platinum', 50000), ('infinite', 175000), ('black', 500000), ('monarch', 1500000), ('vivace', 4000000)
) AS v(slug, xp) WHERE loyalty_cards.slug = v.slug;

UPDATE loyalty_cards SET max_bet_ac = v.ac, max_bet_ag = v.ag FROM (VALUES
  ('none', 250000, 10), ('silver', 500000, 20), ('gold', 1000000, 40), ('platinum', 2500000, 100),
  ('infinite', 8500000, 350), ('black', 20000000, 800), ('monarch', 50000000, 2000), ('vivace', 125000000, 5000)
) AS v(slug, ac, ag) WHERE loyalty_cards.slug = v.slug;

UPDATE loyalty_cards SET perks = v.perks::jsonb, benefits = v.benefits::jsonb FROM (VALUES
  ('none',
   '{"dailyAc": 0, "dailyAg": 0, "weeklyAc": 0, "weeklyAg": 0, "monthlyAc": 0, "monthlyAg": 0, "convertPct": 0, "shopDiscount": 0, "lxpPct": 0, "xpPct": 0, "lxpCap": 4000}',
   '["Max bet 250,000 AC / 10 AG", "Basic chat tag"]'),
  ('silver',
   '{"dailyAc": 10000, "dailyAg": 0, "weeklyAc": 50000, "weeklyAg": 0, "monthlyAc": 150000, "monthlyAg": 1, "convertPct": 25, "shopDiscount": 3, "lxpPct": 5, "xpPct": 5, "lxpCap": 5000}',
   '["Max bet 500,000 AC / 20 AG", "Daily bonus: 10,000 AC", "Weekly bonus: 50,000 AC", "Monthly bonus: 150,000 AC + 1 AG", "1.25× AC → AG daily limit", "3% off in the Shop", "+5% XP and Loyalty XP", "Silver badge, chat tag & emotes"]'),
  ('gold',
   '{"dailyAc": 25000, "dailyAg": 0, "weeklyAc": 125000, "weeklyAg": 1, "monthlyAc": 375000, "monthlyAg": 3, "convertPct": 50, "shopDiscount": 5, "lxpPct": 10, "xpPct": 10, "lxpCap": 6500}',
   '["Max bet 1,000,000 AC / 40 AG", "Daily bonus: 25,000 AC", "Weekly bonus: 125,000 AC + 1 AG", "Monthly bonus: 375,000 AC + 3 AG", "1.5× AC → AG daily limit", "5% off in the Shop", "+10% XP and Loyalty XP", "Gold badge, chat tag, emotes & frame"]'),
  ('platinum',
   '{"dailyAc": 60000, "dailyAg": 1, "weeklyAc": 300000, "weeklyAg": 5, "monthlyAc": 900000, "monthlyAg": 15, "convertPct": 100, "shopDiscount": 8, "lxpPct": 15, "xpPct": 15, "lxpCap": 9000, "onceTier": "vip", "onceDays": 7}',
   '["Max bet 2,500,000 AC / 100 AG", "Daily bonus: 60,000 AC + 1 AG", "Weekly bonus: 300,000 AC + 5 AG", "Monthly bonus: 900,000 AC + 15 AG", "One-time reward: VIP for 7 days", "2× AC → AG daily limit", "8% off in the Shop", "+15% XP and Loyalty XP", "Platinum name & cosmetics"]'),
  ('infinite',
   '{"dailyAc": 175000, "dailyAg": 2, "weeklyAc": 875000, "weeklyAg": 10, "monthlyAc": 2625000, "monthlyAg": 30, "convertPct": 200, "shopDiscount": 10, "lxpPct": 20, "xpPct": 20, "lxpCap": 13000, "onceTier": "vip", "onceDays": 21}',
   '["Max bet 8,500,000 AC / 350 AG", "Daily bonus: 175,000 AC + 2 AG", "Weekly bonus: 875,000 AC + 10 AG", "Monthly bonus: 2,625,000 AC + 30 AG", "One-time reward: VIP for 21 days", "3× AC → AG daily limit", "10% off in the Shop", "+20% XP and Loyalty XP", "Infinite cosmetics & profile effects"]'),
  ('black',
   '{"dailyAc": 400000, "dailyAg": 4, "weeklyAc": 2000000, "weeklyAg": 20, "monthlyAc": 6000000, "monthlyAg": 60, "convertPct": 300, "shopDiscount": 14, "lxpPct": 25, "xpPct": 25, "lxpCap": 18000, "onceTier": "vvip", "onceDays": 14}',
   '["Max bet 20,000,000 AC / 800 AG", "Daily bonus: 400,000 AC + 4 AG", "Weekly bonus: 2,000,000 AC + 20 AG", "Monthly bonus: 6,000,000 AC + 60 AG", "One-time reward: VVIP for 14 days", "4× AC → AG daily limit", "14% off in the Shop", "+25% XP and Loyalty XP", "Black card glow & unique effects"]'),
  ('monarch',
   '{"dailyAc": 1000000, "dailyAg": 8, "weeklyAc": 5000000, "weeklyAg": 40, "monthlyAc": 15000000, "monthlyAg": 120, "convertPct": 400, "shopDiscount": 18, "lxpPct": 30, "xpPct": 30, "lxpCap": 25000, "onceTier": "vvip", "onceDays": 30}',
   '["Max bet 50,000,000 AC / 2,000 AG", "Daily bonus: 1,000,000 AC + 8 AG", "Weekly bonus: 5,000,000 AC + 40 AG", "Monthly bonus: 15,000,000 AC + 120 AG", "One-time reward: VVIP for 30 days", "5× AC → AG daily limit", "18% off in the Shop", "+30% XP and Loyalty XP", "Monarch crown, name, frame & royal effects", "Royal status — only Vivace ranks higher"]'),
  ('vivace',
   '{"dailyAc": 2500000, "dailyAg": 16, "weeklyAc": 12500000, "weeklyAg": 80, "monthlyAc": 37500000, "monthlyAg": 240, "convertPct": 600, "shopDiscount": 22, "lxpPct": 35, "xpPct": 35, "lxpCap": 30000, "onceTier": "vvip", "onceDays": 60}',
   '["Max bet 125,000,000 AC / 5,000 AG", "Daily bonus: 2,500,000 AC + 16 AG", "Weekly bonus: 12,500,000 AC + 80 AG", "Monthly bonus: 37,500,000 AC + 240 AG", "One-time reward: VVIP for 60 days", "7× AC → AG daily limit", "22% off in the Shop", "+35% XP and Loyalty XP", "Vivace concert card, silver tag, clef badge, Vivace name & frame", "Drifting-notes profile effect", "Beyond Monarch: the rarest status in Neon Arcade"]')
) AS v(slug, perks, benefits) WHERE loyalty_cards.slug = v.slug;
