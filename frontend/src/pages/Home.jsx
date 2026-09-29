import { Brain, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductGrid } from '../components/ProductCard'
import { ErrorBox, SearchBar, Section } from '../components/Layout'
import { api } from '../services/api'
import { useStore } from '../services/store'

const CAT_ICON = { Accessories: '👜', Beauty: '💄', Books: '📚', Electronics: '🎧', Fashion: '👟', 'Home & Kitchen': '🍳', Sports: '⚽' }

export default function Home() {
  const { user } = useStore()
  const [home, setHome] = useState(null)
  const [recs, setRecs] = useState(null)
  const [cats, setCats] = useState([])
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    api.home().then(setHome).catch((e) => setError(e.message))
    api.categories().then(setCats).catch(() => {})
  }
  useEffect(load, [])
  useEffect(() => {
    setRecs(null)
    const cid = user && !user.is_admin ? user.customer_id : 'guest'
    api.recommendations(cid).then(setRecs).catch(() => setRecs({ recommendations: [], strategy: 'unavailable' }))
  }, [user])

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"><Sparkles size={14} /> AI-powered shopping</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight md:text-5xl">Shop smarter with products picked for you.</h1>
            <p className="mt-4 max-w-lg text-indigo-100">Describe what you need in plain words. Our semantic search and hybrid recommendation engine do the rest.</p>
            <SearchBar className="mt-6 max-w-lg text-slate-800" />
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {['comfortable running shoes', 'headphones under 3000', 'skincare for daily use', 'books for coding'].map((q) => (
                <Link key={q} to={`/search?q=${encodeURIComponent(q)}`} className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">{q}</Link>
              ))}
            </div>
          </div>
          <div className="hidden grid-cols-2 gap-4 md:grid">
            {[[Brain, 'Hybrid recommendations', 'Content + collaborative filtering'], [Search, 'Semantic search', 'Understands natural language'],
              [ShieldCheck, 'Churn insights', 'Personalised offers that matter'], [Sparkles, 'Demo checkout', 'Safe simulated payments']].map(([Icon, t, d]) => (
              <div key={t} className="rounded-2xl bg-white/10 p-5 backdrop-blur">
                <Icon size={22} />
                <p className="mt-3 font-semibold">{t}</p>
                <p className="text-sm text-indigo-100">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4">
        <Section title="Shop by category">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {(cats.length ? cats : Object.keys(CAT_ICON).map((name) => ({ name }))).map((c) => (
              <Link key={c.name} to={`/search?category=${encodeURIComponent(c.name)}`} className="card flex flex-col items-center gap-1 p-4 text-center hover:border-brand-500">
                <span className="text-3xl">{CAT_ICON[c.name] || '🛍️'}</span>
                <span className="text-sm font-semibold">{c.name}</span>
                {c.count !== undefined && <span className="text-xs text-slate-400">{c.count} items</span>}
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Recommended For You"
          subtitle={recs?.strategy === 'hybrid' ? 'Personalised with our hybrid ML engine (60% content · 40% interactions)' : 'Top-rated picks - log in for personalised recommendations'}>
          <ProductGrid products={recs?.recommendations || []} loading={!recs} count={5} badge="For you" />
        </Section>

        {error ? <div className="mt-10"><ErrorBox message={error} onRetry={load} /></div> : (
          <>
            <Section title="Trending Products" subtitle="Most interacted with in the last 30 days">
              <ProductGrid products={home?.trending?.slice(0, 10) || []} loading={!home} count={5} badge="Trending" />
            </Section>
            <Section title="Popular Products" subtitle="Highly rated and loved by shoppers">
              <ProductGrid products={home?.popular?.slice(0, 10) || []} loading={!home} count={5} />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
