import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tag, GitCommit, ChevronDown, ChevronUp, Copy, Check, ArrowLeft } from 'lucide-react';
import { VERSION_HISTORY, CURRENT_VERSION } from '../config/versions';
import { useNavigate } from 'react-router-dom';

const typeBadge = {
  major: 'bg-red-500/20 text-red-400 border-red-500/30',
  minor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  patch: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function VersionHistory() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(VERSION_HISTORY[0]?.version ?? null);
  const [copied, setCopied] = useState<string | null>(null);

  const copyTag = (version: string) => {
    navigator.clipboard.writeText(`git checkout ${version}`);
    setCopied(version);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/app/director')} className="p-1.5 rounded-lg hover:bg-navy-light/30 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <h1 className="text-2xl font-bold text-white">Version History</h1>
            <span className="px-3 py-1 rounded-full bg-gold/20 text-gold text-sm font-bold border border-gold/30">
              {CURRENT_VERSION}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1 ml-10">Track changes, identify issues, and revert to any version</p>
        </div>
      </div>

      {/* Version Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-navy-light/40" />

        <div className="space-y-4">
          {VERSION_HISTORY.map((v, i) => {
            const isExpanded = expanded === v.version;
            const isCurrent = v.version === CURRENT_VERSION;

            return (
              <motion.div
                key={v.version}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`relative pl-14 ${isCurrent ? '' : ''}`}
              >
                {/* Timeline dot */}
                <div className={`absolute left-4 top-4 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isCurrent
                    ? 'bg-gold border-gold shadow-lg shadow-gold/30'
                    : 'bg-navy-dark border-navy-light/60'
                }`}>
                  {isCurrent && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>

                <div className={`glass-card p-4 ${isCurrent ? 'ring-1 ring-gold/30' : ''}`}>
                  {/* Version header */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : v.version)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-lg font-bold text-white">{v.version}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${typeBadge[v.type]}`}>
                        {v.type}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gold/20 text-gold border border-gold/30">
                          current
                        </span>
                      )}
                      <span className="text-xs text-gray-500">{v.date}</span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>

                  <p className="text-sm text-gray-400 mt-1">{v.description}</p>

                  {/* Expanded details */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="mt-3 space-y-3"
                    >
                      {/* Commit info */}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <GitCommit className="w-3 h-3" /> {v.commit}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyTag(v.version); }}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-navy-light/30 hover:bg-navy-light/50 transition-colors"
                        >
                          {copied === v.version ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          {copied === v.version ? 'Copied!' : `git checkout ${v.version}`}
                        </button>
                      </div>

                      {/* Changes */}
                      <ul className="space-y-1.5">
                        {v.changes.map((change, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-gray-300">
                            <Tag className="w-3 h-3 text-gold mt-1 shrink-0" />
                            {change}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Footer note */}
      <div className="glass-card p-4 text-center">
        <p className="text-xs text-gray-500">
          To revert to any version, run <code className="px-1.5 py-0.5 rounded bg-navy-light/50 text-gray-400">git checkout &lt;tag&gt;</code> in the project directory.
          Use <code className="px-1.5 py-0.5 rounded bg-navy-light/50 text-gray-400">git tag --list</code> to see all available tags.
        </p>
      </div>
    </div>
  );
}
