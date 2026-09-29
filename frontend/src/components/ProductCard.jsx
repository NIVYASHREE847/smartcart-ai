import { Heart, ShoppingCart, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { inr } from '../services/api'
import { useStore } from '../services/store'

const ICONS = {
  'Running Shoes': '👟', 'Wireless Headphones': '🎧', 'Bluetooth Speaker': '🔊', 'Smart Watch': '⌚', 'Power Bank': '🔋',
  'Laptop Stand': '💻', 'Phone Case': '📱', 'Wallet': '👛', 'Backpack': '🎒', 'Sunglasses': '🕶️', 'Travel Pouch': '👝',
  'Air Fryer': '🍟', 'Coffee Maker': '☕', 'Non-Stick Pan': '🍳', 'Table Lamp': '💡', 'Storage Organizer': '🗄️',
  'Body Lotion': '🧴', 'Face Wash': '🧼', 'Hair Serum': '💧', 'Moisturizer': '🫙', 'Sunscreen': '🌞',
  'Business Book': '📘', 'Data Science Guide': '📊', 'Novel': '📖', 'Programming Book': '👨‍💻', 'Self Help Book': '📗',
  'Casual Shirt': '👔', 'Cotton T-Shirt': '👕', 'Denim Jacket': '🧥', 'Sports Track Pants': '👖',
  'Cricket Bat': '🏏', 'Football': '⚽', 'Gym Gloves': '🥊', 'Resistance Bands': '🏋️', 'Yoga Mat': '🧘',
}
const GRADIENTS = {
  Electronics: 'from-sky-100 to-indigo-100', Fashion: 'from-rose-100 to-orange-100', Sports: 'from-emerald-100 to-lime-100',
  Beauty: 'from-pink-100 to-fuchsia-100', Books: 'from-amber-100 to-yellow-50', 'Home & Kitchen': 'from-orange-50 to-amber-100',
  Accessories: 'from-violet-100 to-slate-100',
}

export function ProductImage({ product, size = 'text-6xl', className = '' }) {
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br ${GRADIENTS[product.category] || 'from-slate-100 to-slate-200'} ${className}`}>
      <span className={`${size} drop-shadow-sm select-none`} aria-hidden>{ICONS[product.name] || '🛍️'}</span>
    </div>
  )
}

export function Rating({ value, count }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-1.5 py-0.5 text-white">
        {Number(value).toFixed(1)} <Star size={10} fill="currentColor" />
      </span>
      {count !== undefined && <span className="text-slate-400">({Number(count).toLocaleString()})</span>}
    </span>
  )
}

export default function ProductCard({ product, badge }) {
  const { addToCart, toggleWishlist, wishIds } = useStore()
  const saved = wishIds.has(product.id)
  return (
    <div className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative">
        <Link to={`/product/${product.id}`}><ProductImage product={product} className="aspect-[4/3]" /></Link>
        <button onClick={() => toggleWishlist(product)} aria-label="Toggle wishlist"
          className="absolute right-2 top-2 rounded-full bg-white/90 p-2 shadow hover:bg-white">
          <Heart size={16} className={saved ? 'fill-rose-500 text-rose-500' : 'text-slate-500'} />
        </button>
        {badge && <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">{badge}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
          <span>{product.brand}</span><span>{product.category}</span>
        </div>
        <Link to={`/product/${product.id}`} className="line-clamp-1 font-semibold text-slate-900 hover:text-brand-600">{product.name}</Link>
        <Rating value={product.rating} count={product.review_count} />
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-bold text-slate-900">{inr(product.price)}</span>
          <button onClick={() => addToCart(product)} className="btn-primary px-3 py-1.5" aria-label="Add to cart">
            <ShoppingCart size={15} /> Add
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProductGrid({ products, loading, count = 8, badge }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-[4/3] rounded-none" />
            <div className="space-y-2 p-3"><div className="skeleton h-3 w-2/3" /><div className="skeleton h-4" /><div className="skeleton h-6 w-1/2" /></div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p) => <ProductCard key={p.id} product={p} badge={typeof badge === 'function' ? badge(p) : badge} />)}
    </div>
  )
}
