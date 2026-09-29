import { Link, Route, Routes } from 'react-router-dom'
import { Footer, Navbar } from './components/Layout'
import Admin from './pages/Admin'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import ProductPage from './pages/ProductPage'
import SearchPage from './pages/SearchPage'
import { AuthPage, CartPage, WishlistPage } from './pages/ShopPages'

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<div className="py-24 text-center"><p className="text-2xl font-bold">Page not found</p><Link to="/" className="text-brand-600">Go home</Link></div>} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
