-- Neon Arcade — kompatibilitas untuk hosting tanpa extension (mis. cPanel Domainesia).
-- Dipasang SEBELUM schema.sql. Kalau pgcrypto/citext bisa dipasang, extension asli dipakai;
-- kalau tidak, dibuat pengganti dengan fitur bawaan PostgreSQL 13+ (sha256, gen_random_uuid, ICU).
-- Set `SET neon.no_ext = 'on';` sebelum file ini untuk memaksa jalur pengganti (dipakai saat tes).

DO $$
DECLARE
  skip BOOLEAN := coalesce(current_setting('neon.no_ext', true), '') = 'on';
BEGIN
  IF NOT skip THEN
    BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN CREATE EXTENSION IF NOT EXISTS citext;   EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- ── citext → domain TEXT dengan collation ICU yang tidak peka huruf besar/kecil ──
  IF to_regtype('citext') IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'neon_ci') THEN
      CREATE COLLATION neon_ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
    END IF;
    CREATE DOMAIN citext AS TEXT COLLATE neon_ci;
  END IF;

  -- ── pgcrypto: gen_random_bytes, digest, hmac (hanya sha256 yang dipakai aplikasi) ──
  IF to_regprocedure('gen_random_bytes(integer)') IS NULL THEN
    -- gen_random_uuid() memakai pg_strong_random → aman secara kriptografis.
    -- 16 byte per UUID, 6 bit versi/varian dibuang lewat sha256 supaya merata.
    EXECUTE $f$
      CREATE FUNCTION gen_random_bytes(n INTEGER) RETURNS BYTEA
      LANGUAGE plpgsql VOLATILE STRICT AS $b$
      DECLARE out BYTEA := ''::bytea;
      BEGIN
        IF n < 1 OR n > 1024 THEN RAISE EXCEPTION 'gen_random_bytes: n harus 1..1024'; END IF;
        WHILE length(out) < n LOOP
          out := out || sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()));
        END LOOP;
        RETURN substring(out FROM 1 FOR n);
      END $b$
    $f$;
  END IF;

  IF to_regprocedure('digest(bytea,text)') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION digest(data BYTEA, algo TEXT) RETURNS BYTEA
      LANGUAGE plpgsql IMMUTABLE STRICT AS $b$
      BEGIN
        CASE lower(algo)
          WHEN 'sha256' THEN RETURN sha256(data);
          WHEN 'sha512' THEN RETURN sha512(data);
          WHEN 'sha224' THEN RETURN sha224(data);
          WHEN 'sha384' THEN RETURN sha384(data);
          WHEN 'md5'    THEN RETURN decode(md5(data), 'hex');
          ELSE RAISE EXCEPTION 'digest: algoritma % tidak didukung', algo;
        END CASE;
      END $b$
    $f$;
    EXECUTE $f$
      CREATE FUNCTION digest(data TEXT, algo TEXT) RETURNS BYTEA
      LANGUAGE sql IMMUTABLE STRICT AS $b$ SELECT digest(convert_to(data, 'UTF8'), algo) $b$
    $f$;
  END IF;

  IF to_regprocedure('hmac(bytea,bytea,text)') IS NULL THEN
    -- RFC 2104: H((K ^ opad) || H((K ^ ipad) || m)), blok 64 byte untuk sha256.
    EXECUTE $f$
      CREATE FUNCTION hmac(data BYTEA, key BYTEA, algo TEXT) RETURNS BYTEA
      LANGUAGE plpgsql IMMUTABLE STRICT AS $b$
      DECLARE
        k BYTEA := key;
        ipad BYTEA;
        opad BYTEA;
        i INTEGER;
      BEGIN
        IF lower(algo) <> 'sha256' THEN RAISE EXCEPTION 'hmac: hanya sha256 yang didukung'; END IF;
        IF length(k) > 64 THEN k := sha256(k); END IF;
        k := k || decode(repeat('00', 64 - length(k)), 'hex');
        ipad := k; opad := k;
        FOR i IN 0..63 LOOP
          ipad := set_byte(ipad, i, get_byte(k, i) # 54);   -- 0x36
          opad := set_byte(opad, i, get_byte(k, i) # 92);   -- 0x5c
        END LOOP;
        RETURN sha256(opad || sha256(ipad || data));
      END $b$
    $f$;
    EXECUTE $f$
      CREATE FUNCTION hmac(data TEXT, key TEXT, algo TEXT) RETURNS BYTEA
      LANGUAGE sql IMMUTABLE STRICT AS $b$ SELECT hmac(convert_to(data, 'UTF8'), convert_to(key, 'UTF8'), algo) $b$
    $f$;
  END IF;
END $$;
