-- Yatırım Hesapları Tablosu (Yeni Migrasyon)
-- Bu dosyayı var olan veritabanına eklemek için Supabase SQL Editor'de çalıştırın

-- Yatırım Hesapları Tablosu
CREATE TABLE IF NOT EXISTS investment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(10) NOT NULL, -- XAU, XAG, USD, EUR, GBP
    bank_name VARCHAR(100), -- Banka adı (opsiyonel, fiziksel için null olabilir)
    location VARCHAR(100), -- Konum/açıklama (örn: "Fiziksel - Evde", "Kuveyt Türk Altın Hesabı")
    quantity DECIMAL(15,4) DEFAULT 0,
    average_cost DECIMAL(15,4) DEFAULT 0, -- Ortalama maliyet (TRY/birim)
    is_physical BOOLEAN DEFAULT FALSE, -- Fiziksel mi yoksa banka hesabı mı
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Yatırım Hareketleri Tablosu (Alış/Satış)
CREATE TABLE IF NOT EXISTS investment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES investment_accounts(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL, -- 'buy', 'sell'
    quantity DECIMAL(15,4) NOT NULL,
    price_per_unit DECIMAL(15,4) NOT NULL, -- Birim fiyat (TRY)
    total_amount DECIMAL(15,2) NOT NULL, -- Toplam tutar (TRY)
    transaction_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- İndeks
CREATE INDEX IF NOT EXISTS idx_investment_transactions_account_id ON investment_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_date ON investment_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_investment_accounts_type ON investment_accounts(type);

-- Tetikleyici
DROP TRIGGER IF EXISTS update_investment_accounts_updated_at ON investment_accounts;
CREATE TRIGGER update_investment_accounts_updated_at
    BEFORE UPDATE ON investment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
