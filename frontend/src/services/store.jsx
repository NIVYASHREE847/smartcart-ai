import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'

const StoreContext = createContext(null)
export const useStore = () => useContext(StoreContext)

function loadUser() {
  try { return JSON.parse(localStorage.getItem('sc_user')) } catch { return null }
}

export function StoreProvider({ children }) {
  const [user, setUser] = useState(loadUser)
  const [cart, setCart] = useState({ items: [], count: 0, total: 0 })
  const [wishlist, setWishlist] = useState({ items: [] })
  const [toasts, setToasts] = useState([])
  const navigate = useNavigate()

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const saveSession = (token, u) => {
    try {
      localStorage.setItem('sc_token', token)
      localStorage.setItem('sc_user', JSON.stringify(u))
    } catch { /* storage unavailable */ }
    setUser(u)
  }

  const logout = useCallback(() => {
    try { localStorage.removeItem('sc_token'); localStorage.removeItem('sc_user') } catch { /* ignore */ }
    setUser(null)
    setCart({ items: [], count: 0, total: 0 })
    setWishlist({ items: [] })
  }, [])

  const refresh = useCallback(async () => {
    if (!user || user.is_admin) return
    try {
      const [c, w] = await Promise.all([api.cart(user.customer_id), api.wishlist(user.customer_id)])
      setCart(c)
      setWishlist(w)
    } catch (e) {
      if (e.status === 401) { logout(); toast('Session expired, please log in again', 'error') }
    }
  }, [user, logout, toast])

  useEffect(() => { refresh() }, [refresh])

  const requireLogin = () => {
    if (user) return true
    toast('Please log in to continue', 'error')
    navigate('/login')
    return false
  }

  const addToCart = async (product, qty = 1) => {
    if (!requireLogin()) return
    try {
      setCart(await api.addToCart(product.id, qty))
      toast(`${product.name} added to cart`)
    } catch (e) { toast(e.message, 'error') }
  }

  const wishIds = useMemo(() => new Map(wishlist.items.map((i) => [i.product.id, i.id])), [wishlist])

  const toggleWishlist = async (product) => {
    if (!requireLogin()) return
    try {
      if (wishIds.has(product.id)) {
        setWishlist(await api.removeFromWishlist(wishIds.get(product.id)))
        toast('Removed from wishlist')
      } else {
        setWishlist(await api.addToWishlist(product.id))
        toast('Saved to wishlist')
      }
    } catch (e) { toast(e.message, 'error') }
  }

  const value = { user, cart, setCart, wishlist, setWishlist, wishIds, toast, saveSession, logout, refresh, addToCart, toggleWishlist }
  return (
    <StoreContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className={`rounded-xl px-4 py-3 text-sm font-medium shadow-lg text-white ${t.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  )
}
