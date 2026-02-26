import { ApiConfig, Submission, DiscoveredForm } from '../types';

const DEFAULT_BASE_URL = 'https://eforms.mediaoffice.ae/API';
const DEFAULT_API_KEY = 'af7787b0b077e0e60e89f9d1fa6101e8';

class JotFormApiService {
  private config: ApiConfig;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const stored = localStorage.getItem('jotform_config');
    this.config = stored ? JSON.parse(stored) : {
      apiKey: DEFAULT_API_KEY,
      formIds: [],
      baseUrl: DEFAULT_BASE_URL,
      isConnected: false,
      useDemoData: false,
    };
  }

  getConfig(): ApiConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ApiConfig>) {
    this.config = { ...this.config, ...updates };
    localStorage.setItem('jotform_config', JSON.stringify(this.config));
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      return entry.data as T;
    }
    return null;
  }

  private setCache(key: string, data: unknown) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this.cache.clear();
  }

  async testConnection(): Promise<{ success: boolean; message: string; formCount?: number }> {
    if (!this.config.apiKey) {
      return { success: false, message: 'No API key configured' };
    }
    try {
      const response = await fetch(`${this.config.baseUrl}/user/forms?apiKey=${this.config.apiKey}&limit=1`);
      if (!response.ok) {
        return { success: false, message: `API returned ${response.status}` };
      }
      const data = await response.json();
      this.updateConfig({ isConnected: true });
      return { success: true, message: 'Connected successfully', formCount: data.resultSet?.count };
    } catch (err) {
      return { success: false, message: `Connection failed: ${(err as Error).message}` };
    }
  }

  async getUserForms(): Promise<unknown[]> {
    const cached = this.getCached<unknown[]>('user_forms');
    if (cached) return cached;

    const response = await fetch(`${this.config.baseUrl}/user/forms?apiKey=${this.config.apiKey}&limit=1000`);
    const data = await response.json();
    this.setCache('user_forms', data.content);
    return data.content || [];
  }

  async getFormSubmissions(formId: string, offset = 0, limit = 1000): Promise<unknown[]> {
    const cacheKey = `submissions_${formId}_${offset}`;
    const cached = this.getCached<unknown[]>(cacheKey);
    if (cached) return cached;

    const response = await fetch(
      `${this.config.baseUrl}/form/${formId}/submissions?apiKey=${this.config.apiKey}&offset=${offset}&limit=${limit}`
    );
    const data = await response.json();
    this.setCache(cacheKey, data.content);
    return data.content || [];
  }

  async getSubmissionDetails(submissionId: string): Promise<unknown> {
    const cacheKey = `submission_${submissionId}`;
    const cached = this.getCached<unknown>(cacheKey);
    if (cached) return cached;

    const response = await fetch(
      `${this.config.baseUrl}/submission/${submissionId}?apiKey=${this.config.apiKey}`
    );
    const data = await response.json();
    this.setCache(cacheKey, data.content);
    return data.content;
  }

  parseSubmissionToModel(raw: Record<string, unknown>): Partial<Submission> {
    const answers = raw.answers as Record<string, { answer: string; prettyFormat?: string; text?: string }> || {};
    const answerMap: Record<string, string> = {};
    Object.values(answers).forEach((a) => {
      if (a.text && a.answer) {
        answerMap[a.text] = typeof a.answer === 'string' ? a.answer : a.prettyFormat || JSON.stringify(a.answer);
      }
    });

    return {
      id: raw.id as string,
      submissionDate: raw.created_at as string,
      answers: answerMap,
    };
  }

  async autoDiscoverForms(): Promise<{ forms: DiscoveredForm[]; error?: string }> {
    if (!this.config.apiKey) {
      return { forms: [], error: 'No API key configured' };
    }
    try {
      const response = await fetch(
        `${this.config.baseUrl}/user/forms?apiKey=${this.config.apiKey}&limit=1000&orderby=created_at`
      );
      if (!response.ok) {
        return { forms: [], error: `API returned ${response.status}` };
      }
      const data = await response.json();
      const content = data.content || [];

      const forms: DiscoveredForm[] = content.map((f: Record<string, unknown>) => ({
        id: String(f.id),
        title: String(f.title || 'Untitled Form'),
        count: Number(f.count || 0),
        status: String(f.status || 'ENABLED'),
        created_at: String(f.created_at || ''),
      }));

      // Auto-populate formIds with all discovered form IDs
      const formIds = forms.map(f => f.id);
      this.updateConfig({ formIds, isConnected: true });

      return { forms };
    } catch (err) {
      return { forms: [], error: `Discovery failed: ${(err as Error).message}` };
    }
  }

  async fetchAllSubmissions(): Promise<{ submissions: Partial<Submission>[]; error?: string }> {
    if (!this.config.apiKey || this.config.formIds.length === 0) {
      return { submissions: [], error: 'No API key or forms configured' };
    }

    try {
      const allSubs: Partial<Submission>[] = [];

      for (const formId of this.config.formIds) {
        const rawSubs = await this.getFormSubmissions(formId);
        const parsed = (rawSubs as Record<string, unknown>[]).map(raw => ({
          ...this.parseSubmissionToModel(raw),
          formId,
        }));
        allSubs.push(...parsed);
      }

      return { submissions: allSubs };
    } catch (err) {
      return { submissions: [], error: `Fetch failed: ${(err as Error).message}` };
    }
  }
}

export const jotformApi = new JotFormApiService();
export default jotformApi;
