-- Name prefix / suffix may carry formatting codes (&a, &l, &k…): up to 10 visible characters, 32 stored.
ALTER TABLE users ALTER COLUMN name_prefix TYPE VARCHAR(32);
ALTER TABLE users ALTER COLUMN name_suffix TYPE VARCHAR(32);
