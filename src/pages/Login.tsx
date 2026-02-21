import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signIn, signInWithMagicLink, signInWithMicrosoft } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicSent, setMagicSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (mode === 'magic') {
      const { error: err } = await signInWithMagicLink(email);
      if (err) setError(String(err));
      else setMagicSent(true);
    } else {
      const { error: err } = await signIn(email, password);
      if (err) setError(String(err));
      else navigate('/app');
    }
    setLoading(false);
  };

  const handleMicrosoft = async () => {
    setLoading(true);
    const { error: err } = await signInWithMicrosoft();
    if (err) setError(String(err));
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-navy-dark flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl gold-gradient flex items-center justify-center">
              <Zap className="w-6 h-6 text-navy-dark" />
            </div>
            <span className="text-2xl font-bold text-white">JotFlow</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-gray-400 mt-1">Sign in to your account</p>
        </div>

        <div className="glass-card p-8">
          {magicSent ? (
            <div className="text-center py-8">
              <Mail className="w-12 h-12 text-gold mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Check your email</h3>
              <p className="text-gray-400">We sent a magic link to <strong className="text-white">{email}</strong></p>
            </div>
          ) : (
            <>
              <button onClick={handleMicrosoft} disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-navy-light/50 text-white hover:border-gold/30 transition-all mb-6">
                <svg className="w-5 h-5" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                Sign in with Microsoft
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 h-px bg-navy-light/30" />
                <span className="text-xs text-gray-500 uppercase">or</span>
                <div className="flex-1 h-px bg-navy-light/30" />
              </div>

              <div className="flex gap-2 mb-6">
                <button onClick={() => setMode('password')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'password' ? 'bg-gold/10 text-gold border border-gold/20' : 'text-gray-400 hover:text-white'}`}>Password</button>
                <button onClick={() => setMode('magic')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'magic' ? 'bg-gold/10 text-gold border border-gold/20' : 'text-gray-400 hover:text-white'}`}>Magic Link</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-navy-dark border border-navy-light/30 text-white placeholder-gray-500 focus:border-gold/50 focus:outline-none transition-colors"
                      placeholder="you@company.com" />
                  </div>
                </div>
                {mode === 'password' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-navy-dark border border-navy-light/30 text-white placeholder-gray-500 focus:border-gold/50 focus:outline-none transition-colors"
                        placeholder="••••••••" />
                    </div>
                    <div className="mt-2 text-right">
                      <Link to="/forgot-password" className="text-sm text-gold hover:text-gold-light transition-colors">Forgot password?</Link>
                    </div>
                  </div>
                )}
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full btn-gold py-3 flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign In <ArrowRight className="w-5 h-5" /></>}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-gray-400 mt-6">
          Don't have an account? <Link to="/signup" className="text-gold hover:text-gold-light transition-colors">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
