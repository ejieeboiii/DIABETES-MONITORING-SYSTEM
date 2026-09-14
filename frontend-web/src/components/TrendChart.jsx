import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function TrendChart({ data, height = 220 }) {
  if (!data?.length) {
    return (
      <div className="py-12 text-center text-white/20 text-sm">
        Not enough readings to display a trend chart yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            color: 'white',
          }}
        />
        <ReferenceLine y={1.8} stroke="rgba(234,179,8,0.35)" strokeDasharray="4 4" />
        <ReferenceLine y={3.5} stroke="rgba(239,68,68,0.35)" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="ppm" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
