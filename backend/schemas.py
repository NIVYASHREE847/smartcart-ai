from pydantic import BaseModel, Field

EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(pattern=EMAIL, max_length=200)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: str = Field(pattern=EMAIL, max_length=200)
    password: str


class CartIn(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=20)


class CartUpdate(BaseModel):
    quantity: int = Field(ge=1, le=20)


class WishlistIn(BaseModel):
    product_id: str


class OrderIn(BaseModel):
    # Items are taken from the server-side cart; shipping info is informational for the demo checkout.
    shipping_name: str | None = None
    shipping_address: str | None = None


def product_out(p, full: bool = False) -> dict:
    d = {"id": p.id, "name": p.name, "category": p.category, "brand": p.brand,
         "price": round(p.price, 2), "rating": p.rating, "review_count": p.review_count}
    if full:
        d["description"] = p.description
    return d


def user_out(u) -> dict:
    return {"customer_id": u.customer_id, "name": u.name, "email": u.email, "is_admin": u.is_admin,
            "member_since": u.created_at.isoformat() if u.created_at else None}
