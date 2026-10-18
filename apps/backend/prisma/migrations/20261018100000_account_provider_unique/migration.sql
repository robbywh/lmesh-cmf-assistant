-- Credential accounts are identified by (provider_id, account_id); this lets the seed upsert safely.
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");
