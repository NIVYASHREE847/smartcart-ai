/* global __API_URL__ */
const BASE = __API_URL__

export function getToken() {
  try { return localStorage.getItem('sc_token') } catch { return null }
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error('Cannot reach the server. The API may be waking up - please retry in a few seconds.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    let msg = data.detail
    if (Array.isArray(msg)) msg = msg.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join(', ')
    const err = new Error(msg || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

const qs = (params) => {
  const s = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && s.set(k, v))
  return s.toString()
}

export const api = {
  health: () => request('/api/health'),
  categories: () => request('/api/categories'),
  home: () => request('/api/home'),
  products: (params = {}) => request(`/api/products?${qs(params)}`),
  product: (id) => request(`/api/products/${encodeURIComponent(id)}`),
  search: (params) => request(`/api/search?${qs(params)}`),
  recommendations: (cid) => request(`/api/recommendations/${cid || 'guest'}`),
  churn: (cid) => request(`/api/churn/${cid}`),
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  me: () => request('/api/auth/me'),
  cart: (cid) => request(`/api/cart/${cid}`),
  addToCart: (product_id, quantity = 1) => request('/api/cart', { method: 'POST', body: { product_id, quantity } }),
  updateCart: (id, quantity) => request(`/api/cart/${id}`, { method: 'PATCH', body: { quantity } }),
  removeFromCart: (id) => request(`/api/cart/${id}`, { method: 'DELETE' }),
  wishlist: (cid) => request(`/api/wishlist/${cid}`),
  addToWishlist: (product_id) => request('/api/wishlist', { method: 'POST', body: { product_id } }),
  removeFromWishlist: (id) => request(`/api/wishlist/${id}`, { method: 'DELETE' }),
  placeOrder: (body) => request('/api/orders', { method: 'POST', body }),
  orders: (cid) => request(`/api/orders/${cid}`),
  adminAnalytics: () => request('/api/admin/analytics'),
}

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
