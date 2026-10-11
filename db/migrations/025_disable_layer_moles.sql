-- v2.9.14: Layer and Moles are turned off for now (players see a popup). Re-enable from Admin → Operations.
UPDATE games SET status = 'disabled' WHERE slug IN ('layer', 'moles');
