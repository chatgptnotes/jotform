import type { VercelRequest, VercelResponse } from '@vercel/node';

const JOTFORM_BASE = 'https://eforms.mediaoffice.ae/API';
const API_KEY = process.env.JOTFORM_API_KEY || 'af7787b0b077e0e60e89f9d1fa6101e8';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, APIKEY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path } = req.query;
  const apiPath = Array.isArray(path) ? path.join('/') : path || '';

  // Build target URL
  const url = new URL(`${JOTFORM_BASE}/${apiPath}`);

  // Forward query params, inject API key
  const params = { ...req.query };
  delete params.path;
  params.apiKey = API_KEY;

  for (const [key, val] of Object.entries(params)) {
    if (typeof val === 'string') url.searchParams.set(key, val);
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
    };

    if (req.method === 'POST' || req.method === 'PUT') {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Proxy error', message: String(error) });
  }
}
