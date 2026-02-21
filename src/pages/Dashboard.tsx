import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { FileText, CheckCircle2, Clock, AlertTriangle, AlertOctagon, Download } from 'lucide-react';
import StatCard from '../components/StatCard';
import { exportChartAsPng } from '../services/exportService';

interface Props {
  data: ReturnType<typeof import('../hooks/useSubmissions').useSubmissions>;
}

export default function Dashboard({ data }: Props) {
  const navigate = useNavigate();
  const { stats, approvalStats, departmentStats, trendData } = data;

  const CHART_COLORS = ['#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#10B981', '#6B7280'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-card p-3 text-sm">
        <p className="text-gray-400 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Forms" value={stats.totalForms} icon={FileText} color="gold" delay={0} />
        <StatCard title="Completed" value={stats.completed} icon={CheckCircle2} color="emerald" delay={0.1} />
        <StatCard title="In Progress" value={stats.inProgress} icon={Clock} color="blue" delay={0.2} />
        <StatCard title="Stuck > 7 Days" value={stats.stuckOver7Days} icon={AlertTriangle} color="amber" delay={0.3} />
        <StatCard title="Stuck > 30 Days" value={stats.stuckOver30Days} icon={AlertOctagon} color="red" delay={0.4} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6"
          id="approval-distribution-chart"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Distribution by Approval Level</h3>
            <button onClick={() => exportChartAsPng('approval-distribution-chart', 'approval-distribution')} className="p-1.5 rounded-lg hover:bg-navy-light/30 text-gray-500 hover:text-gold">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={approvalStats}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={3}
                dataKey="count"
                nameKey="level"
                onClick={(_, i) => {
                  const level = approvalStats[i]?.level;
                  if (level?.startsWith('Level')) navigate(`/approval/${level.split(' ')[1]}`);
                }}
                className="cursor-pointer"
              >
                {approvalStats.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i]} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-4 justify-center">
            {approvalStats.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                <span className="text-gray-400">{item.level}</span>
                <span className="text-white font-semibold">{item.count}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Bar Chart - Departments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6"
          id="department-chart"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Forms by Department</h3>
            <button onClick={() => exportChartAsPng('department-chart', 'department-distribution')} className="p-1.5 rounded-lg hover:bg-navy-light/30 text-gray-500 hover:text-gold">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={departmentStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#243656" />
              <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <YAxis type="category" dataKey="department" tick={{ fill: '#9CA3AF', fontSize: 12 }} width={90} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="completed" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} name="Completed" />
              <Bar dataKey="pending" stackId="a" fill="#F59E0B" name="Pending" />
              <Bar dataKey="rejected" stackId="a" fill="#6B7280" radius={[0, 4, 4, 0]} name="Rejected" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Trend Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-6"
        id="trend-chart"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Completion Trend (Last 30 Days)</h3>
          <button onClick={() => exportChartAsPng('trend-chart', 'completion-trend')} className="p-1.5 rounded-lg hover:bg-navy-light/30 text-gray-500 hover:text-gold">
            <Download className="w-4 h-4" />
          </button>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243656" />
            <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="submitted" stroke="#3B82F6" strokeWidth={2} dot={false} name="Submitted" />
            <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2} dot={false} name="Completed" />
            <Line type="monotone" dataKey="rejected" stroke="#EF4444" strokeWidth={2} dot={false} name="Rejected" />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {approvalStats.filter(a => a.level.startsWith('Level')).map((item, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + i * 0.1 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => navigate(`/approval/${i + 1}`)}
            className="glass-card-hover p-5 text-left"
          >
            <div className="flex items-center justify-between">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-2xl font-bold text-white">{item.count}</span>
            </div>
            <p className="text-sm font-medium text-gray-300 mt-3">{item.level}</p>
            <p className="text-xs text-gray-500 mt-1">Avg. {item.avgDays} days waiting</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
