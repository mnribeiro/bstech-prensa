-- Aplicada em 2026-05-06 no projeto BStech (xbybwkfmbsknwlwuohbj).
-- Motivo: a função public.seal_rupture usa digest() do pgcrypto pra gerar o hash
-- SHA-256 da leitura. Como pgcrypto vive no schema "extensions" e o search_path
-- da função era apenas "public", o digest() não era encontrado e a RPC falhava
-- com 42883 (function digest(text, unknown) does not exist).
--
-- Fix: incluir "extensions" no search_path da função.

ALTER FUNCTION public.seal_rupture(
  uuid, uuid, uuid, numeric, text, text, text, jsonb, timestamptz, public.specimen_status
) SET search_path = public, extensions;
