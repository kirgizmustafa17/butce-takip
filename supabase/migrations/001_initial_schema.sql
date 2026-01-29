-- Bütçe Takip Uygulaması - Veritabanı Şeması
-- Bu dosya Supabase SQL Editor'de çalıştırılmalıdır

-- Banka Hesapları Tablosu
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    iban VARCHAR(34),
    balance DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'TRY',
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kredi Kartları Tablosu
CREATE TABLE IF NOT EXISTS credit_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    total_limit DECIMAL(15,2) NOT NULL,
    used_limit DECIMAL(15,2) DEFAULT 0,
    statement_day INTEGER NOT NULL CHECK (statement_day >= 1 AND statement_day <= 31),
    currency VARCHAR(3) DEFAULT 'TRY',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kart Harcamaları Tablosu
CREATE TABLE IF NOT EXISTS card_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_date DATE NOT NULL,
    installments INTEGER DEFAULT 1,
    current_installment INTEGER DEFAULT 1,
    is_paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Yatırımlar Tablosu
CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(10) NOT NULL, -- XAU, XAG, USD, EUR, GBP
    name VARCHAR(100) NOT NULL,
    quantity DECIMAL(15,4) NOT NULL,
    purchase_price DECIMAL(15,4) NOT NULL, -- Birim başına alış fiyatı (TRY)
    purchase_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hesap Hareketleri Tablosu
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'income', 'expense'
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_period VARCHAR(20), -- 'daily', 'weekly', 'monthly', 'yearly'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hesaplar Arası Transferler Tablosu
CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    to_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    transfer_date DATE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kart Ödemeleri Tablosu
CREATE TABLE IF NOT EXISTS card_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    payment_date DATE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Planlı Ödemeler Tablosu
CREATE TABLE IF NOT EXISTS scheduled_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_type VARCHAR(20) NOT NULL, -- 'income', 'expense'
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_period VARCHAR(20), -- 'monthly', 'yearly'
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_card_transactions_card_id ON card_transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_date ON card_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_date ON scheduled_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type);

-- Güncelleme zamanı otomatik güncelleme fonksiyonu
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Tetikleyiciler
DROP TRIGGER IF EXISTS update_bank_accounts_updated_at ON bank_accounts;
CREATE TRIGGER update_bank_accounts_updated_at
    BEFORE UPDATE ON bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_cards_updated_at ON credit_cards;
CREATE TRIGGER update_credit_cards_updated_at
    BEFORE UPDATE ON credit_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_card_transactions_updated_at ON card_transactions;
CREATE TRIGGER update_card_transactions_updated_at
    BEFORE UPDATE ON card_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_investments_updated_at ON investments;
CREATE TRIGGER update_investments_updated_at
    BEFORE UPDATE ON investments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduled_payments_updated_at ON scheduled_payments;
CREATE TRIGGER update_scheduled_payments_updated_at
    BEFORE UPDATE ON scheduled_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) - Opsiyonel, tek kullanıcılı uygulama için devre dışı
-- Eğer ileride çok kullanıcılı yapmak isterseniz bu kısmı aktifleştirin
-- ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
-- ... vb.
