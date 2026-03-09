import type { VercelRequest, VercelResponse } from '@vercel/node';

const JOTFORM_BASE = 'https://eforms.mediaoffice.ae/API';
const JOTFORM_INBOX = 'https://eforms.mediaoffice.ae/inbox';
const API_KEY = process.env.JOTFORM_API_KEY || 'af7787b0b077e0e60e89f9d1fa6101e8';

/**
 * Known workflow → task internal form ID mappings.
 * Populated by calling the JotForm workflow elements API.
 * Key: main form ID, Value: task step's internal form ID
 */
const TASK_FORM_CACHE: Record<string, string> = {};

/**
 * Fetch the internal form ID of the task step for a given main form.
 * Calls /API/form/{formId}/workflows then /API/workflow/{workflowId}/elements.
 */
async function getTaskFormId(mainFormId: string): Promise<string | null> {
  if (TASK_FORM_CACHE[mainFormId]) return TASK_FORM_CACHE[mainFormId];

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

  // Step 3: find the task element
  const taskEl = elements.find(e => e.type === 'workflow_assign_task' && e.internalFormID);
  if (!taskEl?.internalFormID) return null;

  TASK_FORM_CACHE[mainFormId] = taskEl.internalFormID;
  return taskEl.internalFormID;
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
    // 1. Find the task internal form ID for this main form
    const taskFormId = await getTaskFormId(formId);
    if (!taskFormId) {
      // No task step found — fall back to main inbox URL
      return res.status(200).json({
        taskUrl: `${JOTFORM_INBOX}/${formId}/${submissionId}`,
        source: 'fallback',
      });
    }

    // 2. Get the main submission's creation time so we can match the task
    const subRes = await fetch(`${JOTFORM_BASE}/submission/${submissionId}?apiKey=${API_KEY}`);
    const subData = await subRes.json();
    const mainCreatedAt = subData.content?.created_at as string | undefined;
    const mainTime = mainCreatedAt ? new Date(mainCreatedAt + 'Z').getTime() : 0;

    // 3. Fetch task form submissions sorted newest first
    const taskSubsRes = await fetch(
      `${JOTFORM_BASE}/form/${taskFormId}/submissions?apiKey=${API_KEY}&limit=100&orderby=created_at&direction=ASC`
    );
    const taskSubsData = await taskSubsRes.json();
    const taskSubs: Array<{ id: string; created_at: string }> = taskSubsData.content || [];

    // 4. Find the task submission created at or after the main submission (closest match)
    const eligible = taskSubs.filter(t => {
      const tTime = new Date(t.created_at + 'Z').getTime();
      return tTime >= mainTime - 60000; // within 1 min before to any time after
    });

    if (!eligible.length) {
      // No matching task yet — link to task form inbox
      return res.status(200).json({
        taskUrl: `${JOTFORM_INBOX}/${taskFormId}`,
        source: 'inbox',
      });
    }

    // Pick the earliest eligible task submission (closest to when the workflow ran)
    const best = eligible[0];
    return res.status(200).json({
      taskUrl: `${JOTFORM_INBOX}/${taskFormId}/${best.id}`,
      taskFormId,
      taskSubmissionId: best.id,
      source: 'matched',
    });

  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
