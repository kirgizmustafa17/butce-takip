# Bütçe Takip

Kişisel finans yönetimi için kapsamlı bir web uygulaması. Banka hesapları, kredi kartları ve yatırımlarınızı tek bir yerden yönetin.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Özellikler

### 🏦 Banka Hesapları
- Birden fazla banka hesabı ekleme
- Hesaplar arası transfer
- Favori hesap işaretleme
- Farklı para birimleri desteği (TRY, USD, EUR, GBP)

### 💳 Kredi Kartları
- Limit takibi ve kullanım yüzdesi
- Otomatik hesap kesim ve son ödeme tarihi hesaplama
- **Hafta sonu mantığı**: Son ödeme Cumartesi veya Pazar'a denk gelirse Pazartesi'ye kaydırılır
- Taksitli alışveriş desteği (2, 3, 6, 9, 12 taksit)
- Dönem borcu takibi

### 📈 Yatırımlar
- Altın (XAU), Gümüş (XAG), Dolar, Euro, Sterlin takibi
- Ücretsiz API ile anlık fiyat güncelleme
- Kar/zarar hesaplama (TL bazında)
- Portföy özeti

### 📊 Nakit Akışı
- 30 günlük bakiye projeksiyonu
- Gelir ve gider tahmini
- Kredi kartı ödemelerinin otomatik dahil edilmesi
- Görsel grafik ve detaylı tablo
- Negatif bakiye uyarısı

### 📅 Planlı Ödemeler
- Gelir ve gider planlaması
- Tekrarlayan ödemeler (haftalık, aylık, yıllık)
- Hesap bakiyesi otomatik güncelleme
- Gecikmiş ödeme uyarısı

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+
- npm veya yarn
- Supabase hesabı

### Adımlar

1. **Projeyi klonlayın**
```bash
git clone https://github.com/kirgizmustafa17/butce-takip.git
cd butce-takip
```

2. **Bağımlılıkları yükleyin**
```bash
npm install
```

3. **Ortam değişkenlerini ayarlayın**
`.env.local` dosyası oluşturun:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Supabase veritabanını oluşturun**
`supabase/migrations/001_initial_schema.sql` dosyasındaki SQL'i Supabase SQL Editor'de çalıştırın.

5. **Uygulamayı başlatın**
```bash
npm run dev
```

Uygulama http://localhost:3000 adresinde çalışacaktır.

## 🛠 Teknolojiler

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Supabase (PostgreSQL)
- **Styling**: Vanilla CSS (Custom Design System)
- **Charts**: Recharts
- **Date Handling**: date-fns
- **Deployment**: Vercel

## 📁 Proje Yapısı

```
├── app/
│   ├── page.js              # Dashboard
│   ├── hesaplar/            # Banka hesapları
│   ├── kartlar/             # Kredi kartları
│   ├── yatirimlar/          # Yatırımlar
│   ├── nakit-akisi/         # 30 günlük projeksiyon
│   └── odemeler/            # Planlı ödemeler
├── components/
│   ├── layout/              # Sidebar, Header
│   └── ui/                  # Modal, Toast, etc.
├── lib/
│   ├── supabase.js          # Supabase client
│   ├── utils.js             # Utility functions
│   └── priceApi.js          # Fiyat API'si
└── supabase/
    └── migrations/          # SQL migrations
```

## 🔒 Güvenlik

- Tüm veriler Supabase'de güvenli bir şekilde saklanır
- Row Level Security (RLS) ile veri izolasyonu
- Environment variables ile hassas bilgilerin korunması

## 📝 Lisans

MIT License - Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 👨‍💻 Geliştirici

**Mustafa Kırgız**
- GitHub: [@kirgizmustafa17](https://github.com/kirgizmustafa17)
- Email: kirgizmustafa17@outlook.com.tr

---

⭐ Bu projeyi beğendiyseniz yıldız vermeyi unutmayın!
