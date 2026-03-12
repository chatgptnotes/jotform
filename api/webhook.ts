import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const JOTFORM_BASE = 'https://eforms.mediaoffice.ae/API';
const API_KEY = process.env.JOTFORM_API_KEY;
const FORM_ID = process.env.JOTFORM_FORM_ID || '260562405560351';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eekudqlzzklhyhwkqvme.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function extractText(answer: unknown): string {
  if (!answer) return '';
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'number') return String(answer);
  if (Array.isArray(answer)) return answer.filter(Boolean).join(', ');
  if (typeof answer === 'object') {
    const obj = answer as Record<string, string>;
    if (obj.first !== undefined || obj.last !== undefined)
      return [obj.first, obj.last].filter(Boolean).join(' ');
    if (obj.year && obj.month && obj.day)
      return `${obj.year}-${String(obj.month).padStart(2,'0')}-${String(obj.day).padStart(2,'0')}`;
    return Object.values(obj).filter(v => v && typeof v === 'string').join(' ');
  }
  return '';
}

const WEBHOOK_SECRET = process.env.JOTFORM_WEBHOOK_SECRET || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Webhooks are server-to-server — no CORS needed, restrict to POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Validate webhook secret if configured (query param ?secret=...)
  if (WEBHOOK_SECRET) {
    const secret = req.query.secret as string;
    if (secret !== WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Invalid webhook secret' });
    }
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'JOTFORM_API_KEY environment variable is not set' });
  }

  // JotForm sends a POST with rawRequest (URL-encoded JSON) or JSON body
  let submissionId: string | undefined;
  let formId: string | undefined;

  if (req.body) {
    const body = typeof req.body === 'string'
      ? Object.fromEntries(new URLSearchParams(req.body))
      : req.body;
    submissionId = body.submissionID || body.submissionId;
    formId = body.formID || body.formId || FORM_ID;
  }

  if (!submissionId) {
    // Trigger a full sync if no specific submission
    await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/sync`);
    return res.status(200).json({ ok: true, action: 'full-sync-triggered' });
  }

  try {
    // Fetch this specific submission from JotForm
    const url = `${JOTFORM_BASE}/submission/${submissionId}?apiKey=${API_KEY}`;
    const jfRes = await fetch(url);
    if (!jfRes.ok) throw new Error(`JotForm error: ${jfRes.status}`);
    const jfData = await jfRes.json();
    const raw = jfData.content as Record<string, unknown>;
    if (!raw) throw new Error('No content in JotForm response');

    const answers = (raw.answers as Record<string, { answer: unknown }>) || {};
    const get = (id: string) => extractText(answers[id]?.answer);

    const levels = [
      { id: 1, status: get('8'), approver: get('9'), date: get('10') },
      { id: 2, status: get('11'), approver: get('12'), date: get('13') },
      { id: 3, status: get('14'), approver: get('15'), date: get('16') },
      { id: 4, status: get('17'), approver: get('18'), date: get('19') },
    ];

    let currentLevel = 1;
    let status = 'pending';
    for (const lvl of levels) {
      const s = (lvl.status || '').toLowerCase();
      if (s === 'approved') {
        currentLevel = lvl.id + 1;
        if (lvl.id === 4) { currentLevel = 4; status = 'completed'; }
      } else if (s === 'rejected') {
        currentLevel = lvl.id; status = 'rejected'; break;
      } else {
        currentLevel = lvl.id; status = 'pending'; break;
      }
    }

    const createdAt = (raw.created_at as string) || '';
    const submissionDate = createdAt ? new Date(createdAt.replace(' ', 'T') + 'Z') : new Date();
    const totalDays = Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));

    const record = {
      jotform_submission_id: submissionId,
      form_id: formId || FORM_ID,
      title: get('5') || 'Purchase Order',
      submitted_by: get('2'),
      department: get('4') || 'General',
      submission_date: submissionDate.toISOString(),
      current_level: Math.min(currentLevel, 4),
      status,
      days_at_level: totalDays,
      total_days: totalDays,
      approver_name: levels.find(l => l.approver)?.approver || '',
      raw_data: { ...raw, _mapped: { levels } },
      last_synced: new Date().toISOString(),
    };

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error } = await supabase
      .from('jf_submissions')
      .upsert(record, { onConflict: 'jotform_submission_id' });

    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true, submissionId, currentLevel, status });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
