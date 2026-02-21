import { useState } from 'react';
import { User, Save, Loader2, Moon, Sun, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';

export default function Profile() {
  const { profile, updateProfile } = useAuth();
  const { language, setLanguage, themeMode, toggleTheme } = useApp();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const prefs = (profile?.preferences || {}) as Record<string, unknown>;
  const [emailNotifs, setEmailNotifs] = useState(prefs.emailNotifications !== false);
  const [defaultView, setDefaultView] = useState((prefs.defaultView as string) || 'dashboard');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateProfile({
      full_name: fullName,
      department,
      avatar_url: avatarUrl,
      preferences: { ...prefs, theme: themeMode, language, emailNotifications: emailNotifs, defaultView },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <User className="w-7 h-7 text-gold" /> Profile & Settings
        </h1>
        <p className="text-gray-400 mt-1">Manage your personal information and preferences</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Personal Info */}
        <div className="glass-card p-8 space-y-4">
          <h3 className="text-lg font-semibold text-white">Personal Information</h3>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gold/20 flex items-center justify-center text-gold text-2xl font-bold border-2 border-gold/30">
              {avatarUrl ? <img src={avatarUrl} className="w-full h-full rounded-full object-cover" /> : (fullName?.[0] || '?')}
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Avatar URL</label>
              <input type="url" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)}
                className="w-full px-4 py-2 rounded-xl bg-navy-dark border border-navy-light/30 text-white placeholder-gray-500 focus:border-gold/50 focus:outline-none"
                placeholder="https://example.com/avatar.jpg" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-navy-dark border border-navy-light/30 text-white focus:border-gold/50 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Department</label>
            <input type="text" value={department} onChange={e => setDepartment(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-navy-dark border border-navy-light/30 text-white focus:border-gold/50 focus:outline-none" />
          </div>
        </div>

        {/* Preferences */}
        <div className="glass-card p-8 space-y-4">
          <h3 className="text-lg font-semibold text-white">Preferences</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {themeMode === 'dark' ? <Moon className="w-5 h-5 text-gold" /> : <Sun className="w-5 h-5 text-gold" />}
              <span className="text-gray-300">Theme</span>
            </div>
            <button type="button" onClick={toggleTheme}
              className={`w-12 h-6 rounded-full transition-colors ${themeMode === 'dark' ? 'bg-gold' : 'bg-navy-light'} relative`}>
              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${themeMode === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-gold" />
              <span className="text-gray-300">Language</span>
            </div>
            <select value={language} onChange={e => setLanguage(e.target.value as 'en' | 'ar')}
              className="px-4 py-2 rounded-xl bg-navy-dark border border-navy-light/30 text-white focus:border-gold/50 focus:outline-none">
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Email Notifications</span>
            <button type="button" onClick={() => setEmailNotifs(!emailNotifs)}
              className={`w-12 h-6 rounded-full transition-colors ${emailNotifs ? 'bg-gold' : 'bg-navy-light'} relative`}>
              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${emailNotifs ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Default Dashboard View</span>
            <select value={defaultView} onChange={e => setDefaultView(e.target.value)}
              className="px-4 py-2 rounded-xl bg-navy-dark border border-navy-light/30 text-white focus:border-gold/50 focus:outline-none">
              <option value="dashboard">Dashboard</option>
              <option value="tracker">Workflow Tracker</option>
              <option value="bottlenecks">Bottleneck Analysis</option>
            </select>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-gold flex items-center gap-2">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
