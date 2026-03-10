import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const JOTFORM_BASE = 'https://eforms.mediaoffice.ae/API';
const API_KEY = process.env.JOTFORM_API_KEY;
const FORM_ID = process.env.JOTFORM_FORM_ID || '260562405560351';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eekudqlzzklhyhwkqvme.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ─── Field IDs for form 260562405560351 ────────────────────────────────────
// 2=RequesterName, 3=Email, 4=Department, 5=PurchaseDesc, 6=Amount, 7=Priority
// 8=L1Status, 9=L1Approver, 10=L1Date
// 11=L2Status, 12=L2Approver, 13=L2Date
// 14=L3Status, 15=L3Approver, 16=L3Date
// 17=L4Status, 18=L4Approver, 19=L4Date
// 20=OverallStatus

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

function mapSubmission(raw: Record<string, unknown>, formId: string) {
  const answers = (raw.answers as Record<string, { answer: unknown }>) || {};
  const get = (id: string) => extractText(answers[id]?.answer);

  const requesterName = get('2');
  const email = get('3');
  const department = get('4');
  const description = get('5');
  const amount = get('6');
  const priority = get('7') || 'Medium';

  // Approval levels
  const levels = [
    { id: 1, status: get('8'), approver: get('9'), date: get('10') },
    { id: 2, status: get('11'), approver: get('12'), date: get('13') },
    { id: 3, status: get('14'), approver: get('15'), date: get('16') },
    { id: 4, status: get('17'), approver: get('18'), date: get('19') },
  ];
  const overallStatus = get('20');

  // Determine current level & status
  let currentLevel = 1;
  let status = 'pending';

  for (const lvl of levels) {
    const s = (lvl.status || '').toLowerCase();
    if (s === 'approved') {
      currentLevel = lvl.id + 1;
      if (lvl.id === 4) { currentLevel = 4; status = 'completed'; }
    } else if (s === 'rejected' || s === 'denied') {
      currentLevel = lvl.id;
      status = 'rejected';
      break;
    } else if (s === 'pending' || s === '') {
      currentLevel = lvl.id;
      status = 'pending';
      break;
    }
  }

  // Override with overall status if set
  if (overallStatus) {
    const os = overallStatus.toLowerCase();
    if (os.includes('complet') || os.includes('approved')) status = 'completed';
    else if (os.includes('reject')) status = 'rejected';
  }

  const createdAt = (raw.created_at as string) || '';
  const submissionDate = createdAt ? new Date(createdAt.replace(' ', 'T') + 'Z') : new Date();
  const now = new Date();
  const totalDays = Math.floor((now.getTime() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    jotform_submission_id: String(raw.id),
    form_id: formId,
    title: description || 'Purchase Order',
    submitted_by: requesterName || 'Unknown',
    department: department || 'General',
    submission_date: submissionDate.toISOString(),
    current_level: Math.min(currentLevel, 4),
    status,
    days_at_level: totalDays,
    total_days: totalDays,
    approver_name: levels.find(l => l.approver)?.approver || '',
    raw_data: {
      ...raw,
      _mapped: { email, amount, priority, levels, overallStatus },
    },
    last_synced: new Date().toISOString(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!API_KEY) {
    return res.status(500).json({ error: 'JOTFORM_API_KEY environment variable is not set' });
  }

  try {
    // Fetch all submissions from JotForm
    const url = `${JOTFORM_BASE}/form/${FORM_ID}/submissions?apiKey=${API_KEY}&limit=1000&orderby=created_at&direction=DESC`;
    const jfRes = await fetch(url);
    if (!jfRes.ok) throw new Error(`JotForm API error: ${jfRes.status}`);
    const jfData = await jfRes.json();
    const submissions: Record<string, unknown>[] = jfData.content || [];

    // Map to our schema
    const mapped = submissions.map(s => mapSubmission(s, FORM_ID));

    // Upsert into Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase
      .from('jf_submissions')
      .upsert(mapped, { onConflict: 'jotform_submission_id' })
      .select('id');

    if (error) throw new Error(`Supabase upsert error: ${error.message}`);

    // Also upsert the form record
    await supabase.from('jf_forms').upsert({
      id: FORM_ID,
      title: 'Purchase Order Approval - 4 Level Workflow',
      url: `https://eforms.mediaoffice.ae/${FORM_ID}`,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return res.status(200).json({
      success: true,
      synced: mapped.length,
      submissionIds: (data || []).map((d: Record<string, unknown>) => d.id),
    });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
