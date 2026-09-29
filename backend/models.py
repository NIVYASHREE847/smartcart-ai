from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200), unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Behavioural features (seeded from smartcart_customers.csv)
    purchase_frequency: Mapped[int] = mapped_column(Integer, default=0)
    average_spend: Mapped[float] = mapped_column(Float, default=0)
    last_purchase_days: Mapped[int] = mapped_column(Integer, default=0)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    wishlist_count: Mapped[int] = mapped_column(Integer, default=0)
    cart_count: Mapped[int] = mapped_column(Integer, default=0)
    session_count: Mapped[int] = mapped_column(Integer, default=0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    churn_label: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(80), index=True)
    brand: Mapped[str] = mapped_column(String(80), index=True)
    price: Mapped[float] = mapped_column(Float, index=True)
    rating: Mapped[float] = mapped_column(Float, index=True)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(Text, default="")


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(20), index=True)
    total_amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(40), default="Placed")
    payment_status: Mapped[str] = mapped_column(String(60), default="Demo Payment Successful")
    source: Mapped[str] = mapped_column(String(20), default="app")  # app | seed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[float] = mapped_column(Float)
    order: Mapped[Order] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(20), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class WishlistItem(Base):
    __tablename__ = "wishlist"
    __table_args__ = (UniqueConstraint("customer_id", "product_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(20), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    product: Mapped[Product] = relationship()


class CartItem(Base):
    __tablename__ = "cart"
    __table_args__ = (UniqueConstraint("customer_id", "product_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(20), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    product: Mapped[Product] = relationship()


class UserInteraction(Base):
    __tablename__ = "user_interactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    customer_id: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    interaction_type: Mapped[str] = mapped_column(String(20), index=True)  # view|cart|wishlist|purchase|search
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    discount_percent: Mapped[float] = mapped_column(Float, default=0)
    total_amount: Mapped[float] = mapped_column(Float, default=0)
    query: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
