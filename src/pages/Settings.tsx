import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Link2, CheckCircle2, XCircle, Loader2, Plus, Trash2, TestTube2 } from 'lucide-react';
import { jotformApi } from '../services/jotformApi';
import { ApiConfig } from '../types';

export default function Settings() {
  const [config, setConfig] = useState<ApiConfig>(jotformApi.getConfig());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [newFormId, setNewFormId] = useState('');

  useEffect(() => {
    jotformApi.updateConfig(config);
  }, [config]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await jotformApi.testConnection();
    setTestResult(result);
    setConfig(prev => ({ ...prev, isConnected: result.success }));
    setTesting(false);
  };

  const addFormId = () => {
    if (newFormId.trim() && !config.formIds.includes(newFormId.trim())) {
      setConfig(prev => ({ ...prev, formIds: [...prev.formIds, newFormId.trim()] }));
      setNewFormId('');
    }
  };

  const removeFormId = (id: string) => {
    setConfig(prev => ({ ...prev, formIds: prev.formIds.filter(f => f !== id) }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-bold text-white">API Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">Connect to JotForm API to pull live submission data</p>
      </motion.div>

      {/* API Key */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gold/10"><Key className="w-5 h-5 text-gold" /></div>
          <div>
            <h3 className="text-sm font-semibold text-white">JotForm API Key</h3>
            <p className="text-xs text-gray-500">Found in JotForm → Settings → API</p>
          </div>
        </div>
        <input
          type="password"
          value={config.apiKey}
          onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
          placeholder="Enter your JotForm API key..."
          className="w-full bg-navy-dark border border-navy-light/30 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-gold/50 focus:outline-none"
        />
      </motion.div>

      {/* Base URL */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10"><Link2 className="w-5 h-5 text-blue-400" /></div>
          <div>
            <h3 className="text-sm font-semibold text-white">API Base URL</h3>
            <p className="text-xs text-gray-500">Default: https://api.jotform.com</p>
          </div>
        </div>
        <input
          type="text"
          value={config.baseUrl}
          onChange={e => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
          className="w-full bg-navy-dark border border-navy-light/30 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-gold/50 focus:outline-none"
        />
      </motion.div>

      {/* Form IDs */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white">Tracked Form IDs</h3>
        <p className="text-xs text-gray-500">Add specific form IDs to track, or leave empty to track all forms</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newFormId}
            onChange={e => setNewFormId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFormId()}
            placeholder="Enter form ID..."
            className="flex-1 bg-navy-dark border border-navy-light/30 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-gold/50 focus:outline-none"
          />
          <button onClick={addFormId} className="btn-gold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {config.formIds.length > 0 && (
          <div className="space-y-2">
            {config.formIds.map(id => (
              <div key={id} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-navy-dark/50">
                <span className="text-sm font-mono text-gray-300">{id}</span>
                <button onClick={() => removeFormId(id)} className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Test & Demo Toggle */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Demo Mode</h3>
            <p className="text-xs text-gray-500">Use generated demo data instead of live API</p>
          </div>
          <button
            onClick={() => setConfig(prev => ({ ...prev, useDemoData: !prev.useDemoData }))}
            className={`w-12 h-6 rounded-full transition-colors ${config.useDemoData ? 'bg-gold' : 'bg-navy-light'} relative`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${config.useDemoData ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={testing || !config.apiKey}
            className="btn-gold flex items-center gap-2 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
            Test Connection
          </button>
          {testResult && (
            <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.message}
            </div>
          )}
        </div>
      </motion.div>

      {/* Status */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${config.useDemoData ? 'bg-amber-400' : config.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-sm text-gray-300">
            {config.useDemoData ? 'Running in Demo Mode' : config.isConnected ? 'Connected to JotForm API' : 'Not connected'}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
