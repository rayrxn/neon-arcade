-- Only the first card (No Card → Silver) can be bought; every card after that is earned with Loyalty XP.
UPDATE loyalty_cards SET unlock_ac = 1500000, unlock_ag = 5 WHERE rank = 1;
UPDATE loyalty_cards SET unlock_ac = NULL, unlock_ag = NULL WHERE rank <> 1;
