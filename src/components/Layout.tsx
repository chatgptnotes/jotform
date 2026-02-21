import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Table2, AlertTriangle, Settings, RefreshCw, Menu, X, Clock, Zap } from 'lucide-react';
import { RefreshConfig } from '../types';

interface Props {
  children: ReactNode;
  refreshConfig: RefreshConfig;
  setRefreshConfig: (fn: (prev: RefreshConfig) => RefreshConfig) => void;
  onRefresh: () => void;
}

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/tracker', icon: Table2, label: 'Workflow Tracker' },
  { path: '/bottlenecks', icon: AlertTriangle, label: 'Bottleneck Analysis' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout({ children, refreshConfig, setRefreshConfig, onRefresh }: Props) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    onRefresh();
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-navy border-r border-navy-light/20 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-navy-light/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center">
                <Zap className="w-5 h-5 text-navy-dark" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">JotForm</h1>
                <p className="text-xs text-gold">Workflow Dashboard</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-4 space-y-1">
            {NAV_ITEMS.map(item => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-gold/10 text-gold border border-gold/20'
                      : 'text-gray-400 hover:text-white hover:bg-navy-light/30'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Refresh Controls */}
          <div className="p-4 border-t border-navy-light/20">
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Auto Refresh</span>
                <button
                  onClick={() => setRefreshConfig(prev => ({ ...prev, autoRefresh: !prev.autoRefresh }))}
                  className={`w-10 h-5 rounded-full transition-colors ${refreshConfig.autoRefresh ? 'bg-gold' : 'bg-navy-light'} relative`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${refreshConfig.autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {refreshConfig.autoRefresh && (
                <select
                  value={refreshConfig.intervalMinutes}
                  onChange={e => setRefreshConfig(prev => ({ ...prev, intervalMinutes: Number(e.target.value) }))}
                  className="w-full bg-navy-dark border border-navy-light/30 rounded-lg px-3 py-1.5 text-sm text-gray-300"
                >
                  <option value={5}>Every 5 min</option>
                  <option value={15}>Every 15 min</option>
                  <option value={30}>Every 30 min</option>
                </select>
              )}
              {refreshConfig.lastUpdated && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>Updated {new Date(refreshConfig.lastUpdated).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-72">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-navy-dark/80 backdrop-blur-xl border-b border-navy-light/10">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden text-gray-400 hover:text-white">
                {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {NAV_ITEMS.find(i => i.path === location.pathname)?.label || 'Approval Detail'}
                </h2>
                <p className="text-xs text-gray-500">Dubai Government Entity • Workflow Management</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">Demo Mode</span>
              </div>
              <button
                onClick={handleRefresh}
                className="p-2 rounded-xl bg-navy-light/30 hover:bg-navy-light/50 text-gray-400 hover:text-gold transition-all"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
