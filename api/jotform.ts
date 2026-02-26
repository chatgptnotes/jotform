import type { VercelRequest, VercelResponse } from '@vercel/node';

const JOTFORM_BASE = 'https://eforms.mediaoffice.ae/API';
const API_KEY = process.env.JOTFORM_API_KEY || 'af7787b0b077e0e60e89f9d1fa6101e8';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Get the API path from query param
  const apiPath = (req.query.path as string) || 'user/forms';
  const url = new URL(`${JOTFORM_BASE}/${apiPath}`);
  url.searchParams.set('apiKey', API_KEY);

  // Forward other query params
  for (const [key, val] of Object.entries(req.query)) {
    if (key !== 'path' && typeof val === 'string') {
      url.searchParams.set(key, val);
    }
  }

  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Proxy error', message: String(error) });
  }
}
