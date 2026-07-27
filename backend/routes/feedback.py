from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from database import supabase
import resend
import os

router = APIRouter(prefix="/api", tags=["feedback"])

resend.api_key = os.getenv("RESEND_API_KEY")

class FeedbackInput(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    type: str = "bug"
    message: str
    page_url: Optional[str] = None

def send_email_notification(feedback: FeedbackInput):
    try:
        resend.Emails.send({
            "from": "IslandQuiz <support@islandquiz.online>",
            "to": "IslandQuizsup@gmail.com",
            "subject": f"[{feedback.type.upper()}] Новый отзыв от {feedback.name or 'аноним'}",
            "html": f"""
                <h2>Новое сообщение: {feedback.type.upper()}</h2>
                <p><strong>От:</strong> {feedback.name or 'Аноним'} ({feedback.email or 'без почты'})</p>
                <p><strong>Страница:</strong> {feedback.page_url or 'неизвестно'}</p>
                <hr>
                <p><strong>Сообщение:</strong></p>
                <p>{feedback.message}</p>
            """
        })
    except Exception as e:
        print(f"Ошибка отправки email через Resend: {e}")

@router.post("/feedback")
def submit_feedback(input: FeedbackInput, background_tasks: BackgroundTasks):
    supabase.table("feedback").insert({
        "name": input.name,
        "email": input.email,
        "type": input.type,
        "message": input.message,
        "page_url": input.page_url,
    }).execute()
    
    background_tasks.add_task(send_email_notification, input)
    
    return {"ok": True, "message": "Спасибо за обратную связь!"}