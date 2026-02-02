import { NextResponse } from 'next/server';

const BASE_URL = 'https://goldpricez.com/api/rates/currency/try/measure/gram/metal/all';
const API_KEY = 'f546946ca3c821e7b7c3ca48ff571d57f546946c';

export async function GET() {
    try {
        const response = await fetch(BASE_URL, {
            headers: {
                'X-API-KEY': API_KEY,
                'Accept': 'application/json'
            },
            // Ensure we don't cache this on the server side too aggressively if we want real-time
            next: { revalidate: 300 } // Revalidate every 5 minutes
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `API responded with status: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Proxy API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch prices' },
            { status: 500 }
        );
    }
}
