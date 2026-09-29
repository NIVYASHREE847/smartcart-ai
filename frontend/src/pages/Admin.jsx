import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorBox } from '../components/Layout'
import { api, inr } from '../services/api'
import { useStore } from '../services/store'

const RISK_COLORS = { Low: '#10b981', Medium: '#f59e0b', High: '#f43f5e' }
const compact = (n) => '₹' + Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function Stat({ label, value, hint }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function Panel({ title, children, className = '' }) {
  return <div className={`card p-5 ${className}`}><p className="mb-4 font-semibold text-slate-900">{title}</p>{children}</div>
}

export default function Admin() {
  const { user } = useStore()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = () => { setError(''); api.adminAnalytics().then(setData).catch((e) => setError(e.message)) }
  useEffect(() => { if (user?.is_admin) load() }, [user])

  if (!user) return <Navigate to="/login" replace />
  if (!user.is_admin) return <div className="mx-auto max-w-lg px-4 py-16"><ErrorBox message="Admin access required. Log in as admin@smartcart.ai." /></div>
  if (error) return <div className="mx-auto max-w-lg px-4 py-16"><ErrorBox message={error} onRetry={load} /></div>
  if (!data) return <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>

  const t = data.totals
  const churnData = ['Low', 'Medium', 'High'].map((k) => ({ name: k, value: data.churn[k] }))
  const m = data.churn.model || {}
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Admin Analytics</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Total Users" value={t.users.toLocaleString()} />
        <Stat label="Total Products" value={t.products.toLocaleString()} />
        <Stat label="Total Orders" value={t.orders.toLocaleString()} />
        <Stat label="Total Revenue" value={compact(t.revenue)} hint={inr(t.revenue)} />
        <Stat label="Avg. Order Value" value={inr(t.average_order_value)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Top Products (units sold)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.top_products} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="units" fill="#4f46e5" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Customer Churn Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={churnData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {churnData.map((d) => <Cell key={d.name} fill={RISK_COLORS[d.name]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-sm">
            {churnData.map((d) => <span key={d.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLORS[d.name] }} />{d.name}: <b>{d.value}</b></span>)}
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">Avg. churn probability {Math.round(data.churn.average_probability * 100)}%</p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Revenue by Category" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.revenue_by_category}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} width={70} />
              <Tooltip formatter={(v) => inr(v)} />
              <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Churn Model">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Model</dt><dd className="font-medium">{m.model || 'n/a'}</dd></div>
            {m.split && <div className="flex justify-between"><dt className="text-slate-500">Split (train/val/test)</dt><dd>{m.split.train}/{m.split.validation}/{m.split.test}</dd></div>}
            {m.test && Object.entries(m.test).filter(([k]) => k !== 'n').map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt className="text-slate-500">Test {k.replace('_', ' ')}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {m.feature_importance && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-slate-500">Top features</p>
              {Object.entries(m.feature_importance).slice(0, 4).map(([k, v]) => (
                <div key={k} className="text-xs"><div className="flex justify-between"><span>{k}</span><span>{v}</span></div>
                  <div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-brand-500" style={{ width: `${Math.min(100, v * 100 / Math.max(...Object.values(m.feature_importance)))}%` }} /></div></div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Recommendation Statistics">
          <p className="text-xs text-slate-500">{data.recommendations.engine}</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[['Requests', data.recommendations.requests], ['Personalised', data.recommendations.personalized], ['Cold-start', data.recommendations.cold_start]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold">{v || 0}</p><p className="text-xs text-slate-500">{k}</p></div>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">Interaction signals</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {Object.entries(data.recommendations.interactions).map(([k, v]) => <span key={k} className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">{k}: {v.toLocaleString()}</span>)}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Request counters reset when the API restarts.</p>
        </Panel>
        <Panel title="Search Statistics">
          <div className="flex gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold">{data.search.total_searches}</p><p className="text-xs text-slate-500">Total searches</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-bold">{data.search.mode}</p><p className="text-xs text-slate-500">Search engine</p></div>
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">Top queries</p>
          <ul className="mt-1 space-y-1 text-sm">
            {data.search.top_queries.length === 0 && <li className="text-slate-400">No searches yet</li>}
            {data.search.top_queries.map((q) => <li key={q.query} className="flex justify-between"><span className="truncate">{q.query}</span><span className="text-slate-500">{q.count}</span></li>)}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent Orders" className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b text-left text-slate-500"><th className="py-2">Order</th><th>Customer</th><th>Items</th><th>Payment</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {data.recent_orders.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="py-2 font-medium">#{o.id}</td><td className="font-mono text-xs">{o.customer_id}</td>
                <td className="truncate">{o.items.map((i) => `${i.product.name}×${i.quantity}`).join(', ')}</td>
                <td className="text-xs text-emerald-700">{o.payment_status}</td><td className="text-right font-semibold">{inr(o.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
