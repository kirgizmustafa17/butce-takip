import { NextResponse } from 'next/server';

// Bigpara Altın Sayfası
const URL = 'https://bigpara.hurriyet.com.tr/altin/';

export async function GET() {
    try {
        const response = await fetch(URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            },
            next: { revalidate: 60 } // Revalidate every minute
        });

        if (!response.ok) {
            throw new Error(`Bigpara fetch failed: ${response.status}`);
        }

        const html = await response.text();

        // Regex to find all <li class="cell009">...</li> values
        // Using global flag to find all occurrences
        const regex = /<li class="cell009">(.*?)<\/li>/g;
        const matches = [];
        let match;

        while ((match = regex.exec(html)) !== null) {
            matches.push(match[1]); // match[1] is the content inside the tag
        }

        // Indices (User provided 5th, 8th, 9th, 12th, 93rd, 96th elements... which are 1-based?)
        // User said:
        // 5. element -> Gold Price. (Index 4)
        // 8. element -> Gold Time. (Index 7)
        // 9. element -> 22k Bracelet Price (Index 8)
        // 12. element -> 22k Bracelet Time (Index 11)
        // 93. element -> Silver Price (Index 92)
        // 96. element -> Silver Time (Index 95)

        const goldPrice = matches[4];
        const goldTime = matches[7];

        const braceletPrice = matches[8];
        const braceletTime = matches[11];

        const silverPrice = matches[92];

        // Helper to parse "2.266,62" -> 2266.62
        const parsePrice = (str) => {
            if (!str) return null;
            // Remove dots (thousands), replace comma with dot (decimal)
            return parseFloat(str.replace(/\./g, '').replace(',', '.'));
        };

        const data = {
            'gram-altin': parsePrice(goldPrice),
            '22-ayar-bilezik': parsePrice(braceletPrice),
            'gumus': parsePrice(silverPrice),
            'updateDate': new Date().toISOString()
        };

        // Parse time if valid (e.g. "17:01")
        // Bigpara only gives HH:mm, so we assume today
        if (goldTime && goldTime.includes(':')) {
            try {
                const [hours, minutes] = goldTime.split(':');
                const now = new Date();

                // Construct a date string in TRT (UTC+3)
                // Format: YYYY-MM-DDTHH:mm:00+03:00
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');

                const trTime = `${year}-${month}-${day}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00+03:00`;

                // Parse this string - javascript correctly handles the offset
                data.updateDate = new Date(trTime).toISOString();
            } catch (e) {
                console.error('Time parsing error', e);
            }
        }

        // Ensure valid JSON numbers
        if (isNaN(data['gram-altin'])) data['gram-altin'] = null;
        if (isNaN(data['22-ayar-bilezik'])) data['22-ayar-bilezik'] = null;
        if (isNaN(data['gumus'])) data['gumus'] = null;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Scraping error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch prices' },
            { status: 500 }
        );
    }
}
