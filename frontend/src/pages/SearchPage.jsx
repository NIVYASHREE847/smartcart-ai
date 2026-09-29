import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductGrid } from '../components/ProductCard'
import { Empty, ErrorBox, SearchBar } from '../components/Layout'
import { api } from '../services/api'

const CATEGORIES = ['Accessories', 'Beauty', 'Books', 'Electronics', 'Fashion', 'Home & Kitchen', 'Sports']

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const filters = {
    category: params.get('category') || '', min_price: params.get('min_price') || '', max_price: params.get('max_price') || '',
    min_rating: params.get('min_rating') || '', sort: params.get('sort') || (q ? 'relevance' : 'popular'),
  }
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const key = params.toString()

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    const req = q
      ? api.search({ q, ...filters }).then((r) => ({ ...r, items: r.results.map((x) => ({ ...x.product, score: x.similarity_score })) }))
      : api.products({ ...filters, limit: 40 }).then((r) => ({ items: r.items, total: r.total }))
    req.then((r) => alive && setData(r)).catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload])

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <SearchBar key={q} initial={q} className="max-w-2xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="card h-fit space-y-4 p-4 text-sm">
          <p className="font-semibold text-slate-900">Filters</p>
          <label className="block">Category
            <select className="input mt-1" value={filters.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <div>Price (₹)
            <div className="mt-1 flex gap-2">
              <input className="input" type="number" min="0" placeholder="Min" defaultValue={filters.min_price} key={`min${filters.min_price}`}
                onBlur={(e) => set('min_price', e.target.value)} />
              <input className="input" type="number" min="0" placeholder="Max" defaultValue={filters.max_price} key={`max${filters.max_price}`}
                onBlur={(e) => set('max_price', e.target.value)} />
            </div>
          </div>
          <label className="block">Minimum rating
            <select className="input mt-1" value={filters.min_rating} onChange={(e) => set('min_rating', e.target.value)}>
              <option value="">Any</option>
              {['4.5', '4', '3.5', '3'].map((r) => <option key={r} value={r}>{r}★ & up</option>)}
            </select>
          </label>
          <label className="block">Sort by
            <select className="input mt-1" value={filters.sort} onChange={(e) => set('sort', e.target.value)}>
              {q && <option value="relevance">Relevance</option>}
              {!q && <option value="popular">Popularity</option>}
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="rating">Rating</option>
            </select>
          </label>
          <button className="btn-outline w-full" onClick={() => setParams(q ? { q } : {})}>Clear filters</button>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {q ? <>Results for <span className="font-semibold text-slate-900">“{q}”</span></> : <span className="font-semibold text-slate-900">{filters.category || 'All products'}</span>}
            {!loading && data && <span>· {data.total} found</span>}
            {q && data?.mode && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                <Sparkles size={12} /> Semantic search ({data.mode})
              </span>
            )}
            {data?.parsed?.max_price && !params.get('max_price') && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Understood: under ₹{data.parsed.max_price}</span>}
          </div>
          {error ? <ErrorBox message={error} onRetry={() => setReload((n) => n + 1)} />
            : !loading && data?.items.length === 0 ? (
              <Empty title="No products found">Try different words, e.g. “wireless headphones” or remove some filters.</Empty>
            ) : (
              <ProductGrid products={data?.items || []} loading={loading} count={10}
                badge={q ? (p) => `${Math.round((p.score || 0) * 100)}% match` : undefined} />
            )}
        </div>
      </div>
    </div>
  )
}
