import { CheckCircle2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ProductGrid, ProductImage } from '../components/ProductCard'
import { Empty } from '../components/Layout'
import { api, inr } from '../services/api'
import { useStore } from '../services/store'

export function CartPage() {
  const { user, cart, setCart, toast } = useStore()
  const [placing, setPlacing] = useState(false)
  const [order, setOrder] = useState(null)
  const navigate = useNavigate()
  if (!user) return <Navigate to="/login" replace />

  const update = async (fn) => {
    try { setCart(await fn()) } catch (e) { toast(e.message, 'error') }
  }
  const checkout = async () => {
    setPlacing(true)
    try {
      const res = await api.placeOrder({ shipping_name: user.name })
      setOrder(res.order)
      setCart({ items: [], count: 0, total: 0 })
      toast(res.message)
    } catch (e) { toast(e.message, 'error') } finally { setPlacing(false) }
  }

  if (order) return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="card p-8 text-center">
        <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
        <h1 className="mt-4 text-2xl font-bold">Demo Payment Successful</h1>
        <p className="mt-2 text-sm text-slate-500">Order #{order.id} confirmed · {inr(order.total_amount)}</p>
        <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">This is a simulated payment. No money was charged.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="btn-primary" onClick={() => navigate('/dashboard')}>View my orders</button>
          <Link to="/" className="btn-outline">Continue shopping</Link>
        </div>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Shopping Cart</h1>
      {cart.items.length === 0 ? <Empty title="Your cart is empty"><Link to="/" className="text-brand-600">Browse products</Link></Empty> : (
        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            {cart.items.map((i) => (
              <div key={i.id} className="card flex items-center gap-4 p-3">
                <Link to={`/product/${i.product.id}`}><ProductImage product={i.product} size="text-4xl" className="h-20 w-20 rounded-xl" /></Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/product/${i.product.id}`} className="font-semibold hover:text-brand-600">{i.product.name}</Link>
                  <p className="text-xs text-slate-500">{i.product.brand} · {i.product.category}</p>
                  <p className="mt-1 text-sm font-semibold">{inr(i.product.price)}</p>
                </div>
                <select className="input w-20" value={i.quantity} onChange={(e) => update(() => api.updateCart(i.id, Number(e.target.value)))} aria-label="Quantity">
                  {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => <option key={n}>{n}</option>)}
                </select>
                <p className="hidden w-24 text-right font-semibold sm:block">{inr(i.line_total)}</p>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => update(() => api.removeFromCart(i.id))} aria-label="Remove"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
          <div className="card h-fit space-y-3 p-5">
            <p className="font-semibold">Order summary</p>
            <div className="flex justify-between text-sm"><span>Items ({cart.count})</span><span>{inr(cart.total)}</span></div>
            <div className="flex justify-between text-sm"><span>Delivery</span><span className="text-emerald-600">Free</span></div>
            <div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Total</span><span>{inr(cart.total)}</span></div>
            <button className="btn-primary w-full py-3" disabled={placing} onClick={checkout}>{placing ? 'Processing…' : 'Checkout (Demo Payment)'}</button>
            <p className="text-center text-xs text-slate-400">Simulated payment - no real charge</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function WishlistPage() {
  const { user, wishlist } = useStore()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">My Wishlist</h1>
      {wishlist.items.length === 0
        ? <Empty title="Your wishlist is empty">Tap the heart on any product to save it. <Link to="/" className="text-brand-600">Browse products</Link></Empty>
        : <ProductGrid products={wishlist.items.map((i) => i.product)} loading={false} />}
    </div>
  )
}

export function AuthPage({ mode }) {
  const { saveSession, toast, user } = useStore()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  if (user) return <Navigate to={user.is_admin ? '/admin' : '/dashboard'} replace />
  const isLogin = mode === 'login'

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const res = isLogin ? await api.login({ email: form.email, password: form.password }) : await api.register(form)
      saveSession(res.token, res.user)
      toast(`Welcome${isLogin ? ' back' : ''}, ${res.user.name}!`)
      navigate(res.user.is_admin ? '/admin' : '/')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const field = (k, label, type = 'text') => (
    <label className="block text-sm font-medium">{label}
      <input className="input mt-1" type={type} required value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} autoComplete={k} />
    </label>
  )
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <form onSubmit={submit} className="card space-y-4 p-8">
        <h1 className="text-2xl font-bold">{isLogin ? 'Log in to SmartCart AI' : 'Create your account'}</h1>
        {!isLogin && field('name', 'Full name')}
        {field('email', 'Email', 'email')}
        {field('password', 'Password', 'password')}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Log in' : 'Register'}</button>
        <p className="text-center text-sm text-slate-500">
          {isLogin ? <>New here? <Link to="/register" className="text-brand-600">Create an account</Link></> : <>Have an account? <Link to="/login" className="text-brand-600">Log in</Link></>}
        </p>
        {isLogin && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold">Demo credentials</p>
            <button type="button" className="mt-1 block text-left hover:text-brand-600" onClick={() => setForm({ ...form, email: 'demo@smartcart.ai', password: 'Demo@123' })}>Customer: demo@smartcart.ai / Demo@123</button>
            <button type="button" className="block text-left hover:text-brand-600" onClick={() => setForm({ ...form, email: 'admin@smartcart.ai', password: 'Admin@123' })}>Admin: admin@smartcart.ai / Admin@123</button>
          </div>
        )}
      </form>
    </div>
  )
}
