-- 1.0.0 Release goes public: everyone sees the release update log and trailer.
INSERT INTO neon_kv (key, value) VALUES ('release', '{"published": true}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
