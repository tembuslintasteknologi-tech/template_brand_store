-- 0012_wallet_ledger.sql
-- Wallet ledger guard rails (WLT-001..WLT-003).
-- Safe to re-run, every statement is idempotent.
--
-- The wallets and wallet_transactions tables already exist since 0006. This migration adds the
-- one constraint the module needs: a wallet can be debited or credited at most once for a given
-- (type, reference_id) pair.
--
-- Why a unique index and not application logic: the paying endpoint may be retried by a client,
-- a queue, or a double click. Postgres is the only place that can refuse the second write
-- atomically. NULL reference ids stay unlimited, which is what admin topups and manual
-- adjustments use, so those are not constrained.

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_tx_wallet_type_reference_idx"
  ON "wallet_transactions" ("wallet_id", "type", "reference_id");

-- Support lookups read the ledger newest first per wallet, which the existing
-- wallet_tx_created_idx already helps with. No further index is needed.
