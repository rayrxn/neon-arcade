-- v2.6 economy pass: Silver card can be bought for 150,000 AC + 5 AG (was 1,500,000 AC + 5 AG).
UPDATE loyalty_cards SET unlock_ac = 150000, unlock_ag = 5 WHERE slug = 'silver';
