import { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Mail, Loader2, Trash2 } from 'lucide-react';
import { useAuth, OrgRole } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Member {
  id: string;
  user_id: string;
  role: OrgRole;
  joined_at: string;
  profile?: { full_name: string; department: string; avatar_url: string };
}

const ROLE_LABELS: Record<OrgRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  approver: 'Approver',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<OrgRole, string> = {
  super_admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  admin: 'bg-gold/20 text-gold border-gold/30',
  approver: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  viewer: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function TeamManagement() {
  const { organization, hasPermission, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('viewer');
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if (!organization) return;
    loadMembers();
  }, [organization]);

  const loadMembers = async () => {
    if (!organization) return;
    const { data } = await supabase.from('org_members').select('*').eq('org_id', organization.id);
    if (data) {
      const enriched = await Promise.all(data.map(async (m) => {
        const { data: p } = await supabase.from('profiles').select('full_name, department, avatar_url').eq('user_id', m.user_id).single();
        return { ...m, profile: p || undefined } as Member;
      }));
      setMembers(enriched);
    }
    setLoading(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    setInviting(true);
    // In production, this would send an invite email. For now, log it.
    await supabase.from('activity_log').insert({
      org_id: organization.id,
      user_id: user.id,
      action: 'invite_member',
      entity_type: 'org_member',
      details: { email: inviteEmail, role: inviteRole },
    });
    setInviteEmail('');
    setShowInvite(false);
    setInviting(false);
  };

  const updateRole = async (memberId: string, role: OrgRole) => {
    await supabase.from('org_members').update({ role }).eq('id', memberId);
    loadMembers();
  };

  const removeMember = async (memberId: string) => {
    await supabase.from('org_members').delete().eq('id', memberId);
    loadMembers();
  };

  const canManage = hasPermission(['super_admin', 'admin']);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="w-7 h-7 text-gold" /> Team Management
          </h1>
          <p className="text-gray-400 mt-1">Manage your organization's team members and roles</p>
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(!showInvite)} className="btn-gold flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> Invite Member
          </button>
        )}
      </div>

      {showInvite && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Invite Team Member</h3>
          <form onSubmit={handleInvite} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-navy-dark border border-navy-light/30 text-white focus:border-gold/50 focus:outline-none"
                  placeholder="colleague@company.com" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as OrgRole)}
                className="px-4 py-3 rounded-xl bg-navy-dark border border-navy-light/30 text-white focus:border-gold/50 focus:outline-none">
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <button type="submit" disabled={inviting} className="btn-gold py-3 px-6">
              {inviting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Invite'}
            </button>
          </form>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-gold animate-spin" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-navy-light/20">
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Member</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Department</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Role</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Joined</th>
                {canManage && <th className="text-right px-6 py-4 text-sm font-medium text-gray-400">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b border-navy-light/10 hover:bg-navy-light/10 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center text-gold font-semibold">
                        {(m.profile?.full_name || '?')[0]}
                      </div>
                      <span className="text-white font-medium">{m.profile?.full_name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-400">{m.profile?.department || '-'}</td>
                  <td className="px-6 py-4">
                    {canManage ? (
                      <select value={m.role} onChange={e => updateRole(m.id, e.target.value as OrgRole)}
                        className={`px-3 py-1 rounded-lg text-sm border ${ROLE_COLORS[m.role]} bg-transparent focus:outline-none`}>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm border ${ROLE_COLORS[m.role]}`}>
                        <Shield className="w-3 h-3" /> {ROLE_LABELS[m.role]}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-sm">{new Date(m.joined_at).toLocaleDateString()}</td>
                  {canManage && (
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => removeMember(m.id)} className="p-2 text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No team members yet</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
