import type { VercelRequest, VercelResponse } from '@vercel/node';

const JOTFORM_BASE = 'https://eforms.mediaoffice.ae/API';
const API_KEY = process.env.JOTFORM_API_KEY || 'af7787b0b077e0e60e89f9d1fa6101e8';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const submissionId = req.query.submissionId as string;
  if (!submissionId) return res.status(400).json({ error: 'submissionId required' });

  try {
    const url = `${JOTFORM_BASE}/submission/${submissionId}?apiKey=${API_KEY}`;
    
    // Forward the body as form data
    const body = typeof req.body === 'string' ? req.body : new URLSearchParams(req.body as Record<string, string>).toString();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Proxy error', message: String(error) });
  }
}
