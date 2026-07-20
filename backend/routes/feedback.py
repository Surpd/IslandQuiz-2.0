from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from database import supabase

router = APIRouter(prefix="/api", tags=["feedback"])

class FeedbackInput(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    type: str = "bug"
    message: str
    page_url: Optional[str] = None

@router.post("/feedback")
def submit_feedback(input: FeedbackInput):
    supabase.table("feedback").insert({
        "name": input.name,
        "email": input.email,
        "type": input.type,
        "message": input.message,
        "page_url": input.page_url,
    }).execute()
    return {"ok": True, "message": "Спасибо за обратную связь!"}