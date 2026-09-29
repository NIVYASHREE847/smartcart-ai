import { Gift, Package } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ProductGrid, ProductImage } from '../components/ProductCard'
import { Empty, Section } from '../components/Layout'
import { api, inr } from '../services/api'
import { useStore } from '../services/store'

const RISK = { Low: 'bg-emerald-100 text-emerald-700', Medium: 'bg-amber-100 text-amber-700', High: 'bg-rose-100 text-rose-700' }

export default function Dashboard() {
  const { user, toast } = useStore()
  const [orders, setOrders] = useState(null)
  const [churn, setChurn] = useState(null)
  const [recs, setRecs] = useState(null)

  useEffect(() => {
    if (!user || user.is_admin) return
    api.orders(user.customer_id).then((r) => setOrders(r.orders)).catch((e) => { setOrders([]); toast(e.message, 'error') })
    api.churn(user.customer_id).then(setChurn).catch(() => setChurn({ error: true }))
    api.recommendations(user.customer_id).then(setRecs).catch(() => setRecs({ recommendations: [] }))
  }, [user, toast])

  if (!user) return <Navigate to="/login" replace />
  if (user.is_admin) return <Navigate to="/admin" replace />
  const pct = churn && !churn.error ? Math.round(churn.churn_probability * 100) : 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Hi, {user.name} 👋</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-500">Customer information</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Customer ID</dt><dd className="font-mono">{user.customer_id}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd>{user.email}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Orders</dt><dd>{orders ? orders.length : '…'}</dd></div>
            {churn?.features && <div className="flex justify-between"><dt className="text-slate-500">Avg. spend</dt><dd>{inr(churn.features.average_spend)}</dd></div>}
          </dl>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-500">Churn risk (ML prediction)</p>
          {!churn ? <div className="skeleton mt-3 h-16" /> : churn.error ? <p className="mt-3 text-sm text-slate-500">Churn prediction unavailable right now.</p> : (
            <>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-4xl font-extrabold">{pct}%</span>
                <span className={`mb-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK[churn.risk_level]}`}>{churn.risk_level} risk</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${pct >= 70 ? 'bg-rose-500' : pct >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
              <p className="mt-3 text-xs text-slate-500">Action: {churn.recommended_action} · Model: {churn.model}</p>
            </>
          )}
        </div>
        <div className={`card p-5 ${churn?.offer ? 'border-brand-500 bg-brand-50' : ''}`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Gift size={16} /> Personalised offer</p>
          {churn?.offer ? (
            <>
              <p className="mt-3 text-lg font-bold text-brand-700">{churn.offer.message}</p>
              <p className="mt-2 inline-block rounded-lg border-2 border-dashed border-brand-500 px-3 py-1 font-mono font-bold text-brand-700">{churn.offer.code}</p>
            </>
          ) : <p className="mt-3 text-sm text-slate-500">You're a valued regular - keep enjoying loyalty rewards on every order.</p>}
        </div>
      </div>

      <Section title="Recent orders">
        {!orders ? <div className="skeleton h-24" /> : orders.length === 0 ? <Empty title="No orders yet">Your orders will show up here.</Empty> : (
          <div className="space-y-3">
            {orders.slice(0, 6).map((o) => (
              <div key={o.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-semibold"><Package size={16} /> Order #{o.id}</span>
                  <span className="text-slate-500">{new Date(o.created_at).toLocaleDateString()}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{o.payment_status}</span>
                  <span className="font-bold">{inr(o.total_amount)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {o.items.map((i, n) => (
                    <div key={n} className="flex items-center gap-2 text-sm">
                      <ProductImage product={i.product} size="text-2xl" className="h-10 w-10 rounded-lg" />
                      <span>{i.product.name} × {i.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recommended For You" subtitle="Hybrid ML: 0.6 × content similarity + 0.4 × interaction score">
        <ProductGrid products={recs?.recommendations || []} loading={!recs} count={5} badge="For you" />
      </Section>
    </div>
  )
}
