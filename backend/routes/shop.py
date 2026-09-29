from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from auth import create_token, current_user, ensure_self_or_admin, hash_password, verify_password
from database import get_db
from models import CartItem, Order, OrderItem, Product, User, UserInteraction, WishlistItem
from schemas import CartIn, CartUpdate, LoginIn, OrderIn, RegisterIn, WishlistIn, product_out, user_out

router = APIRouter(prefix="/api", tags=["shop"])


# ---------- auth ----------
@router.post("/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    last = db.scalar(select(func.max(User.customer_id)).where(User.customer_id.like("C%")))
    next_num = int(last[1:]) + 1 if last and last[1:].isdigit() else 1
    user = User(customer_id=f"C{next_num:04d}", name=body.name.strip(), email=email,
                password_hash=hash_password(body.password), session_count=1)
    db.add(user)
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    user.session_count += 1
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


def _log(db, user, product_id, kind, qty=1, amount=0.0):
    db.add(UserInteraction(customer_id=user.customer_id, product_id=product_id, interaction_type=kind,
                           quantity=qty, total_amount=amount))


def _product_or_404(db, pid):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "Product not found")
    return p


# ---------- cart ----------
def _cart(db, customer_id):
    items = db.scalars(select(CartItem).options(selectinload(CartItem.product))
                       .where(CartItem.customer_id == customer_id).order_by(CartItem.id)).all()
    out = [{"id": i.id, "quantity": i.quantity, "product": product_out(i.product),
            "line_total": round(i.quantity * i.product.price, 2)} for i in items]
    return {"customer_id": customer_id, "items": out, "count": sum(i["quantity"] for i in out),
            "total": round(sum(i["line_total"] for i in out), 2)}


@router.get("/cart/{customer_id}")
def get_cart(customer_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    ensure_self_or_admin(user, customer_id)
    return _cart(db, customer_id)


@router.post("/cart")
def add_to_cart(body: CartIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = _product_or_404(db, body.product_id)
    item = db.scalar(select(CartItem).where(CartItem.customer_id == user.customer_id, CartItem.product_id == p.id))
    if item:
        item.quantity = min(20, item.quantity + body.quantity)
    else:
        db.add(CartItem(customer_id=user.customer_id, product_id=p.id, quantity=body.quantity))
    _log(db, user, p.id, "cart", body.quantity)
    user.cart_count += 1
    db.commit()
    return _cart(db, user.customer_id)


@router.patch("/cart/{item_id}")
def update_cart(item_id: int, body: CartUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = db.get(CartItem, item_id)
    if not item or item.customer_id != user.customer_id:
        raise HTTPException(404, "Cart item not found")
    item.quantity = body.quantity
    db.commit()
    return _cart(db, user.customer_id)


@router.delete("/cart/{item_id}")
def remove_from_cart(item_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = db.get(CartItem, item_id)
    if not item or item.customer_id != user.customer_id:
        raise HTTPException(404, "Cart item not found")
    db.delete(item)
    db.commit()
    return _cart(db, user.customer_id)


# ---------- wishlist ----------
def _wishlist(db, customer_id):
    items = db.scalars(select(WishlistItem).options(selectinload(WishlistItem.product))
                       .where(WishlistItem.customer_id == customer_id).order_by(WishlistItem.id.desc())).all()
    return {"customer_id": customer_id, "items": [{"id": i.id, "product": product_out(i.product)} for i in items]}


@router.get("/wishlist/{customer_id}")
def get_wishlist(customer_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    ensure_self_or_admin(user, customer_id)
    return _wishlist(db, customer_id)


@router.post("/wishlist")
def add_to_wishlist(body: WishlistIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = _product_or_404(db, body.product_id)
    if not db.scalar(select(WishlistItem).where(WishlistItem.customer_id == user.customer_id, WishlistItem.product_id == p.id)):
        db.add(WishlistItem(customer_id=user.customer_id, product_id=p.id))
        _log(db, user, p.id, "wishlist")
        user.wishlist_count += 1
        db.commit()
    return _wishlist(db, user.customer_id)


@router.delete("/wishlist/{item_id}")
def remove_from_wishlist(item_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = db.get(WishlistItem, item_id)
    if not item or item.customer_id != user.customer_id:
        raise HTTPException(404, "Wishlist item not found")
    db.delete(item)
    db.commit()
    return _wishlist(db, user.customer_id)


# ---------- orders ----------
def order_out(o: Order) -> dict:
    return {"id": o.id, "customer_id": o.customer_id, "total_amount": round(o.total_amount, 2), "status": o.status,
            "payment_status": o.payment_status, "created_at": o.created_at.isoformat() if o.created_at else None,
            "items": [{"product": product_out(i.product), "quantity": i.quantity, "unit_price": i.unit_price} for i in o.items]}


@router.post("/orders")
def place_order(body: OrderIn | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    cart = db.scalars(select(CartItem).options(selectinload(CartItem.product)).where(CartItem.customer_id == user.customer_id)).all()
    if not cart:
        raise HTTPException(400, "Your cart is empty")
    total = round(sum(i.quantity * i.product.price for i in cart), 2)
    # DEMO PAYMENT: no real payment processing happens here.
    order = Order(customer_id=user.customer_id, total_amount=total, status="Confirmed", payment_status="Demo Payment Successful")
    for i in cart:
        order.items.append(OrderItem(product_id=i.product_id, quantity=i.quantity, unit_price=i.product.price))
        _log(db, user, i.product_id, "purchase", i.quantity, round(i.quantity * i.product.price, 2))
        db.delete(i)
    db.add(order)
    # Refresh behavioural features used by the churn model
    n = user.purchase_frequency
    user.average_spend = round((user.average_spend * n + total) / (n + 1), 2)
    user.purchase_frequency = n + 1
    user.last_purchase_days = 0
    db.commit()
    db.refresh(order)
    return {"message": "Demo Payment Successful", "order": order_out(order)}


@router.get("/orders/{customer_id}")
def list_orders(customer_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    ensure_self_or_admin(user, customer_id)
    orders = db.scalars(select(Order).options(selectinload(Order.items).selectinload(OrderItem.product))
                        .where(Order.customer_id == customer_id).order_by(Order.created_at.desc()).limit(50)).all()
    return {"customer_id": customer_id, "orders": [order_out(o) for o in orders]}
