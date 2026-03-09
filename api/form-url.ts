import type { VercelRequest, VercelResponse } from '@vercel/node';

const JOTFORM_BASE = 'https://eforms.mediaoffice.ae/API';
const JOTFORM_INBOX = 'https://eforms.mediaoffice.ae/inbox';
const API_KEY = process.env.JOTFORM_API_KEY || 'af7787b0b077e0e60e89f9d1fa6101e8';

/**
 * Known workflow → form internal form ID mappings.
 * Key: main form ID, Value: form-fill step's internal form ID
 */
const FORM_INTERNAL_ID_CACHE: Record<string, string> = {};

/**
 * Non-form element types to skip when scanning workflow elements.
 * We want a form-fill step, not task/approval/routing elements.
 */
const SKIP_TYPES = new Set([
  'workflow_start_point',
  'workflow_end_point',
  'workflow_approval',
  'workflow_assign_task',
  'workflow_condition',
  'workflow_notification',
]);

/**
 * Fetch the internal form ID of the form-fill step for a given main form.
 * Calls /API/form/{formId}/workflows → /API/workflow/{workflowId}/elements.
 * Finds the first element that has an internalFormID and is NOT a task/approval type.
 */
async function getFormStepInternalId(mainFormId: string): Promise<string | null> {
  if (FORM_INTERNAL_ID_CACHE[mainFormId]) return FORM_INTERNAL_ID_CACHE[mainFormId];

  // Step 1: get workflows attached to this form
  const wfRes = await fetch(`${JOTFORM_BASE}/form/${mainFormId}/workflows?apiKey=${API_KEY}`);
  if (!wfRes.ok) return null;
  const wfData = await wfRes.json();
  const workflows: Array<{ id: string }> = wfData.content || [];
  if (!workflows.length) return null;

  // Step 2: get elements of the first workflow
  const workflowId = workflows[0].id;
  const elRes = await fetch(`${JOTFORM_BASE}/workflow/${workflowId}/elements?apiKey=${API_KEY}`);
  if (!elRes.ok) return null;
  const elData = await elRes.json();
  const elements: Array<{ type: string; internalFormID?: string }> = elData.content || [];

  // Step 3: find the first form-fill element (has internalFormID, is not a skip type)
  const formEl = elements.find(e => e.internalFormID && !SKIP_TYPES.has(e.type));
  if (!formEl?.internalFormID) return null;

  FORM_INTERNAL_ID_CACHE[mainFormId] = formEl.internalFormID;
  return formEl.internalFormID;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { formId, submissionId } = req.query as { formId: string; submissionId: string };
  if (!formId || !submissionId) {
    return res.status(400).json({ error: 'formId and submissionId required' });
  }

  try {
    // 1. Find the form-fill internal form ID for this main form
    const internalFormId = await getFormStepInternalId(formId);
    if (!internalFormId) {
      // No form-fill step found — fall back to main inbox URL
      return res.status(200).json({
        formUrl: `${JOTFORM_INBOX}/${formId}/${submissionId}`,
        source: 'fallback',
      });
    }

    // 2. Get the main submission's creation time for matching
    const subRes = await fetch(`${JOTFORM_BASE}/submission/${submissionId}?apiKey=${API_KEY}`);
    const subData = await subRes.json();
    const mainCreatedAt = subData.content?.created_at as string | undefined;
    const mainTime = mainCreatedAt ? new Date(mainCreatedAt + 'Z').getTime() : 0;

    // 3. Fetch form-fill submissions sorted oldest first
    const formSubsRes = await fetch(
      `${JOTFORM_BASE}/form/${internalFormId}/submissions?apiKey=${API_KEY}&limit=100&orderby=created_at&direction=ASC`
    );
    const formSubsData = await formSubsRes.json();
    const formSubs: Array<{ id: string; created_at: string }> = formSubsData.content || [];

    // 4. Match by creation time (within 1 min before or any time after)
    const eligible = formSubs.filter(f => {
      const fTime = new Date(f.created_at + 'Z').getTime();
      return fTime >= mainTime - 60000;
    });

    if (!eligible.length) {
      // No matching form submission yet — link to the form's inbox
      return res.status(200).json({
        formUrl: `${JOTFORM_INBOX}/${internalFormId}`,
        internalFormId,
        source: 'inbox',
      });
    }

    // Pick the earliest eligible submission (closest to when the workflow ran)
    const best = eligible[0];
    return res.status(200).json({
      formUrl: `${JOTFORM_INBOX}/${internalFormId}/${best.id}`,
      internalFormId,
      formSubmissionId: best.id,
      source: 'matched',
    });

  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
