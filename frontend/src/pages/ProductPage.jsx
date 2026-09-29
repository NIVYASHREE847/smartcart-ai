import { Heart, ShieldCheck, ShoppingCart, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ProductGrid, ProductImage, Rating } from '../components/ProductCard'
import { ErrorBox, Section } from '../components/Layout'
import { api, inr } from '../services/api'
import { useStore } from '../services/store'

export default function ProductPage() {
  const { id } = useParams()
  const { addToCart, toggleWishlist, wishIds, user } = useStore()
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [qty, setQty] = useState(1)
  const [recs, setRecs] = useState(null)

  useEffect(() => {
    setP(null); setError(''); setQty(1)
    api.product(id).then(setP).catch((e) => setError(e.status === 404 ? 'This product does not exist.' : e.message))
    window.scrollTo(0, 0)
  }, [id])
  useEffect(() => {
    if (user && !user.is_admin) api.recommendations(user.customer_id).then(setRecs).catch(() => setRecs(null))
  }, [user, id])

  if (error) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorBox message={error} /><p className="mt-4 text-center"><Link to="/" className="text-brand-600">Back to home</Link></p></div>
  if (!p) return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:grid-cols-2">
      <div className="skeleton aspect-square" /><div className="space-y-3"><div className="skeleton h-6 w-1/3" /><div className="skeleton h-10" /><div className="skeleton h-24" /></div>
    </div>
  )
  const saved = wishIds.has(p.id)
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="mb-4 text-sm text-slate-500"><Link to="/" className="hover:text-brand-600">Home</Link> / <Link to={`/search?category=${encodeURIComponent(p.category)}`} className="hover:text-brand-600">{p.category}</Link> / {p.name}</nav>
      <div className="grid gap-8 md:grid-cols-2">
        <ProductImage product={p} size="text-[9rem]" className="card aspect-square" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{p.brand}</p>
          <h1 className="mt-1 text-3xl font-extrabold text-slate-900">{p.name}</h1>
          <div className="mt-2 flex items-center gap-3"><Rating value={p.rating} count={p.review_count} /><span className="text-sm text-slate-500">{p.category}</span></div>
          <p className="mt-5 text-3xl font-bold text-slate-900">{inr(p.price)}</p>
          <p className="text-xs text-slate-500">Inclusive of all taxes</p>
          <p className="mt-5 leading-relaxed text-slate-600">{p.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-slate-300 bg-white">
              <button className="px-3 py-2" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease">−</button>
              <span className="w-8 text-center font-semibold">{qty}</span>
              <button className="px-3 py-2" onClick={() => setQty(Math.min(20, qty + 1))} aria-label="Increase">+</button>
            </div>
            <button className="btn-primary px-6 py-3" onClick={() => addToCart(p, qty)}><ShoppingCart size={18} /> Add to Cart</button>
            <button className="btn-outline px-5 py-3" onClick={() => toggleWishlist(p)}>
              <Heart size={18} className={saved ? 'fill-rose-500 text-rose-500' : ''} /> {saved ? 'Wishlisted' : 'Add to Wishlist'}
            </button>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-600">
            <div className="card flex items-center gap-2 p-3"><Truck size={18} className="text-brand-600" /> Free delivery over ₹999</div>
            <div className="card flex items-center gap-2 p-3"><ShieldCheck size={18} className="text-brand-600" /> 7-day easy returns</div>
          </div>
        </div>
      </div>

      <Section title="Similar Products" subtitle="Content similarity (category, brand, description, price, rating) blended with co-purchase signals">
        <ProductGrid products={p.similar} loading={false} badge={(s) => `${Math.round(s.similarity * 100)}% similar`} />
      </Section>
      {recs?.recommendations?.length > 0 && (
        <Section title="Recommended For You" subtitle="Personalised from your browsing, cart and purchase history">
          <ProductGrid products={recs.recommendations.slice(0, 5)} loading={false} badge="For you" />
        </Section>
      )}
    </div>
  )
}
