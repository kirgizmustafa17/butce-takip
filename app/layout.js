import "./globals.css";
import AppLayout from "@/components/layout/AppLayout";

export const metadata = {
  title: "Bütçe Takip - Kişisel Finans Yönetimi",
  description: "Banka hesapları, kredi kartları ve yatırımlarınızı tek bir yerden yönetin. Nakit akışınızı takip edin.",
  keywords: "bütçe, finans, yatırım, kredi kartı, banka hesabı, nakit akışı",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>
        <AppLayout>
          {children}
        </AppLayout>
      </body>
    </html>
  );
}
