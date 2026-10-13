import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AuthenticationEvent } from './types'

type ActivityPoint = { hour: string; success: number; failed: number }

function buildHourlyActivity(events: AuthenticationEvent[]): ActivityPoint[] {
  const buckets = new Map<string, ActivityPoint>()
  for (const event of events) {
    const date = new Date(event.timestamp)
    const hour = `${String(date.getHours()).padStart(2, '0')}:00`
    const point = buckets.get(hour) ?? { hour, success: 0, failed: 0 }
    point[event.outcome] += 1
    buckets.set(hour, point)
  }
  return [...buckets.values()].sort((a, b) => a.hour.localeCompare(b.hour))
}

export default function ActivityChart({ events }: { events: AuthenticationEvent[] }) {
  const points = buildHourlyActivity(events)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="successFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#51e0b0" stopOpacity={0.24} />
            <stop offset="100%" stopColor="#51e0b0" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="failureFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6878" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#ff6878" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#253039" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#829099', fontSize: 11 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#829099', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#131a1f', border: '1px solid #303b42', borderRadius: 10, color: '#eaf0f2' }}
          labelStyle={{ color: '#aebbc1' }}
          formatter={(value, name) => [value, name === 'success' ? 'Sucesso' : 'Falha']}
          labelFormatter={(label) => `Hora: ${label}`}
        />
        <Area type="monotone" dataKey="success" stroke="#51e0b0" strokeWidth={2} fill="url(#successFill)" />
        <Area type="monotone" dataKey="failed" stroke="#ff6878" strokeWidth={2} fill="url(#failureFill)" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
