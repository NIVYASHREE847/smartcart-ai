import { Heart, LayoutDashboard, LogOut, Search, Shield, ShoppingCart, Sparkles, User } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useStore } from '../services/store'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-extrabold text-slate-900">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"><Sparkles size={18} /></span>
      <span className="text-lg">SmartCart<span className="text-brand-600"> AI</span></span>
    </Link>
  )
}

export function SearchBar({ initial = '', className = '' }) {
  const [q, setQ] = useState(initial)
  const navigate = useNavigate()
  const submit = (e) => {
    e.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }
  return (
    <form onSubmit={submit} className={`relative ${className}`}>
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} className="input py-2.5 pl-10"
        placeholder='Try "comfortable running shoes under 3000"' aria-label="Search products" />
    </form>
  )
}

export function Navbar() {
  const { user, cart, wishlist, logout } = useStore()
  const navigate = useNavigate()
  const link = ({ isActive }) => `flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium ${isActive ? 'text-brand-600' : 'text-slate-600 hover:text-slate-900'}`
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Logo />
        <SearchBar className="order-last w-full md:order-none md:mx-6 md:w-auto md:flex-1" />
        <nav className="ml-auto flex items-center gap-1">
          {user?.is_admin && <NavLink to="/admin" className={link}><Shield size={17} /><span className="hidden sm:inline">Admin</span></NavLink>}
          {user && !user.is_admin && <NavLink to="/dashboard" className={link}><LayoutDashboard size={17} /><span className="hidden sm:inline">Dashboard</span></NavLink>}
          <NavLink to="/wishlist" className={link}>
            <Heart size={17} /><span className="hidden sm:inline">Wishlist</span>
            {wishlist.items.length > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] text-white">{wishlist.items.length}</span>}
          </NavLink>
          <NavLink to="/cart" className={link}>
            <ShoppingCart size={17} /><span className="hidden sm:inline">Cart</span>
            {cart.count > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white">{cart.count}</span>}
          </NavLink>
          {user ? (
            <button className="btn-outline ml-1 px-3" onClick={() => { logout(); navigate('/') }}><LogOut size={15} /> <span className="hidden sm:inline">Logout</span></button>
          ) : (
            <Link to="/login" className="btn-primary ml-1"><User size={15} /> Login</Link>
          )}
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-slate-500">Intelligent e-commerce powered by hybrid recommendations, semantic search and churn prediction.</p>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-slate-900">Shop</p>
          <ul className="mt-2 space-y-1 text-slate-500">
            <li><Link to="/search?q=running shoes" className="hover:text-brand-600">Running shoes</Link></li>
            <li><Link to="/search?q=wireless headphones" className="hover:text-brand-600">Headphones</Link></li>
            <li><Link to="/search?q=skincare" className="hover:text-brand-600">Skincare</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-slate-900">Account</p>
          <ul className="mt-2 space-y-1 text-slate-500">
            <li><Link to="/dashboard" className="hover:text-brand-600">My dashboard</Link></li>
            <li><Link to="/cart" className="hover:text-brand-600">Cart</Link></li>
            <li><Link to="/wishlist" className="hover:text-brand-600">Wishlist</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">© {new Date().getFullYear()} SmartCart AI · MVP demo · Payments are simulated</p>
    </footer>
  )
}

export function Section({ title, subtitle, action, children }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm text-rose-600">{message}</p>
      {onRetry && <button className="btn-outline" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      <div className="text-sm text-slate-500">{children}</div>
    </div>
  )
}
