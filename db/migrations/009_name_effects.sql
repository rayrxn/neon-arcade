-- Name effects with motion styles (style.anim): watery wave, neon pulse, fire, shine, electric, glitch.
-- Effects cover the VVIP prefix and suffix too.
INSERT INTO shop_items (id, category, kind, name, description, price_ag, rarity, repeatable, requires, style, effect, sort) VALUES
  ('name-watery', 'name-effects', 'nameEffect', 'Watery Name', 'Your name ripples like water, letter by letter.', 14, 'epic', FALSE, '{}', '{"colors": ["#a5f3fc", "#38bdf8", "#3b82f6", "#67e8f9"], "anim": "wave"}', '{}', 46),
  ('name-neon', 'name-effects', 'nameEffect', 'Neon Pulse', 'A neon sign that breathes light.', 10, 'rare', FALSE, '{}', '{"colors": ["#f0abfc", "#22d3ee", "#f0abfc"], "anim": "pulse"}', '{}', 47),
  ('name-static', 'name-effects', 'nameEffect', 'Static Glitch', 'White noise that splits red and cyan.', 9, 'rare', FALSE, '{}', '{"colors": ["#f8fafc", "#94a3b8", "#f8fafc"], "anim": "glitch"}', '{}', 48),
  ('name-holo', 'name-effects', 'nameEffect', 'Holo Shine', 'Pearl colors with a bright light sweep.', 12, 'epic', FALSE, '{}', '{"colors": ["#e0e7ff", "#c4b5fd", "#a5f3fc", "#fbcfe8"], "anim": "shine"}', '{}', 49),
  ('name-volt', 'name-effects', 'nameEffect', 'Volt Name', 'Electric yellow and cyan, sparking.', 14, 'epic', FALSE, '{}', '{"colors": ["#fef08a", "#22d3ee", "#fef08a"], "anim": "electric"}', '{}', 50),
  ('name-inferno', 'name-effects', 'nameEffect', 'Inferno Name', 'Flames rising through your name.', 18, 'legendary', FALSE, '{}', '{"colors": ["#fff7ae", "#fb923c", "#ef4444"], "anim": "fire"}', '{}', 51)
ON CONFLICT (id) DO NOTHING;

UPDATE shop_items SET style = style || '{"anim": "shine"}'::jsonb WHERE id = 'pass-name';
UPDATE shop_items SET style = style || '{"anim": "glitch"}'::jsonb WHERE id IN ('name-glitch', 'name-toxic', 'name-monarch');
