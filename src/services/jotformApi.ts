import { ApiConfig, Submission } from '../types';

const DEFAULT_BASE_URL = 'https://api.jotform.com';

class JotFormApiService {
  private config: ApiConfig;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const stored = localStorage.getItem('jotform_config');
    this.config = stored ? JSON.parse(stored) : {
      apiKey: '',
      formIds: [],
      baseUrl: DEFAULT_BASE_URL,
      isConnected: false,
      useDemoData: true,
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
    // This will need customization based on the actual form structure
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
}

export const jotformApi = new JotFormApiService();
export default jotformApi;
