import type { VercelRequest, VercelResponse } from '@vercel/node';

const JOTFORM_BASE = 'https://eforms.mediaoffice.ae/API';
const API_KEY = process.env.JOTFORM_API_KEY || 'af7787b0b077e0e60e89f9d1fa6101e8';

export type StepType = 'approval' | 'task' | 'form';

export interface WorkflowStep {
  level: number;
  type: StepType;
  label: string;
  questionId: string;
}

/**
 * Manual step-type configuration per form.
 * This overrides keyword auto-detection.
 * Key: formId, Value: map of level → StepType
 *
 * Use this to configure step types for each form without
 * needing to rename questions in JotForm.
 */
const STEP_TYPE_CONFIG: Record<string, Record<number, StepType>> = {
  // Purchase Order Approval — 4-level workflow
  '260562405560351': {
    1: 'form',      // Level 1: Requester fills in a form → View Form button
    2: 'task',      // Level 2: Finance team processes a task → View Task button
    3: 'approval',  // Level 3: Director approves + signs → Review & Sign
    4: 'approval',  // Level 4: Executive final approval + sign → Review & Sign
  },
  // Content Publishing Approval — single level
  '260562114142344': {
    1: 'approval',  // Content publishing: single approval step
  },
};

/**
 * Infer step type from question label text.
 *
 * Rules (first match wins):
 *  - "task", "todo", "to-do", "action item", "procurement", "finance", "payment",
 *    "processing", "raise po", "raise order"  → task
 *  - "fill", "complete form", "evaluation", "evaluate", "assessment",
 *    "review form", "submit form"              → form
 *  - anything else (default)                  → approval
 */
function detectStepType(label: string): StepType {
  const t = label.toLowerCase();
  if (/\b(task|todo|to-do|action item|procurement|finance|payment|processing|raise po|raise order)\b/.test(t))
    return 'task';
  if (/\b(fill|complete form|evaluation|evaluate|assessment|review form|submit form)\b/.test(t))
    return 'form';
  return 'approval';
}

// Simple in-process cache (reused across warm invocations of the same Lambda)
const cache: Record<string, { steps: WorkflowStep[]; at: number }> = {};
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const formId = req.query.formId as string;
  if (!formId) return res.status(400).json({ error: 'formId required' });

  // Return cached result if still fresh
  const cached = cache[formId];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.status(200).json({ formId, steps: cached.steps, cached: true });
  }

  // Check manual config override first — skips JotForm API call entirely
  const configuredSteps = STEP_TYPE_CONFIG[formId];
  if (configuredSteps) {
    const steps: WorkflowStep[] = Object.entries(configuredSteps).map(([level, type]) => ({
      level: parseInt(level),
      type,
      label: `Level ${level}`,
      questionId: '',
    }));
    cache[formId] = { steps, at: Date.now() };
    return res.status(200).json({ formId, steps, source: 'config' });
  }

  try {
    const qRes = await fetch(`${JOTFORM_BASE}/form/${formId}/questions?apiKey=${API_KEY}`);
    if (!qRes.ok) return res.status(500).json({ error: `JotForm questions API returned ${qRes.status}` });

    const qData = await qRes.json();
    const questions = (qData.content || {}) as Record<string, {
      type: string;
      text?: string;
      order?: string;
    }>;

    // Collect dropdown fields whose label looks like a workflow step
    const candidates: Array<{ qid: string; text: string; order: number }> = [];
    for (const [qid, q] of Object.entries(questions)) {
      if (q.type !== 'control_dropdown' || !q.text) continue;
      const t = q.text.toLowerCase();
      // Include if it mentions level/approval/task/step/evaluation/finance/form
      if (/\b(level|approval|task|step|evaluation|finance|form completion|todo)\b/.test(t)) {
        candidates.push({ qid, text: q.text, order: parseInt(q.order || '999') });
      }
    }

    candidates.sort((a, b) => a.order - b.order);

    const steps: WorkflowStep[] = candidates.map((c, i) => ({
      level: i + 1,
      type: detectStepType(c.text),
      label: c.text,
      questionId: c.qid,
    }));

    cache[formId] = { steps, at: Date.now() };
    return res.status(200).json({ formId, steps });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
