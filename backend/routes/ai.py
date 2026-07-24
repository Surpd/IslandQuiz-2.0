import os
import json
from typing import Optional, List
import pdfplumber
from docx import Document
import io

from fastapi import APIRouter, Depends, UploadFile, File, Form
from pydantic import BaseModel
import httpx
from datetime import datetime, timedelta
from routes.auth import get_current_user
from services.ai_prompts import (
    generate_question_prompt,
    improve_question_prompt,
    generate_quiz_prompt,
    generate_jeopardy_categories_prompt,
    generate_jeopardy_questions_prompt,
    generate_from_file_prompt
)

router = APIRouter(prefix="/api/ai", tags=["ai"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


async def call_openai(prompt: str) -> str:
    if not OPENAI_API_KEY:
        return json.dumps({"mock": True, "prompt": prompt[:100]})

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
            },
        )
        data = response.json()
        if "choices" not in data or not data["choices"]:
            print(f"[AI] Bad response: {json.dumps(data)[:300]}")
            return json.dumps({"error": "Empty response"})
        content = data["choices"][0]["message"]["content"]
        return content


def normalize_variants(result) -> list:
    variants = []
    if isinstance(result, dict):
        if "variants" in result:
            v = result["variants"]
            if isinstance(v, dict) and "questions" in v:
                variants = v["questions"]
            elif isinstance(v, list):
                variants = v
            else:
                variants = [v]
        elif "questions" in result:
            variants = result["questions"]
        else:
            variants = [result]
    elif isinstance(result, list):
        variants = result
    else:
        variants = []

    difficulties = ["easy", "medium", "hard"]
    for i, v in enumerate(variants):
        if isinstance(v, dict):
            if "difficulty" not in v:
                v["difficulty"] = difficulties[i] if i < len(difficulties) else "medium"
            
            # Добавить correctAnswer для всех типов
            if "correctAnswer" not in v:
                if "options" in v and "correct" in v:
                    idx = v["correct"]
                    if isinstance(idx, int) and 0 <= idx < len(v["options"]):
                        v["correctAnswer"] = v["options"][idx]
                elif "answer" in v:
                    v["correctAnswer"] = v["answer"]
                else:
                    v["correctAnswer"] = ""

            # Для ordering — убедиться что есть options
            if "options" not in v:
                v["options"] = []

            # Для matching — убедиться что есть pairs
            if "pairs" not in v:
                v["pairs"] = []

    return variants


def clean_json(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Убрать первую строку (```json или ```)
        if lines[0].startswith("```"):
            lines = lines[1:]
        # Убрать последнюю строку (```)
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines)
    return cleaned.strip()

# ---------- AI Limits ----------

def get_today_ai_count(user_id: str) -> int:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    res = supabase.table("ai_usage").select("id", count="exact").eq("user_id", user_id).gte("created_at", today).execute()
    return res.count if hasattr(res, 'count') else len(res.data or [])

def increment_ai_count(user_id: str, request_type: str):
    supabase.table("ai_usage").insert({
        "user_id": user_id,
        "request_type": request_type,
    }).execute()

def check_ai_limit(user):
    if not user:
        return
    role = user.get("role", "user")
    if role == "admin":
        return  # безлимитно
    plan = user.get("plan", "free")
    limits = {"free": 10, "premium": 100}
    daily_limit = limits.get(plan, 10)
    count = get_today_ai_count(user["id"])
    if count >= daily_limit:
        raise HTTPException(status_code=429, detail=f"Лимит AI-запросов исчерпан ({daily_limit}/день). Повысьте тариф до Premium.")
    increment_ai_count(user["id"], "ai_request")
    
# ---------- Schemas ----------

class GenerateQuestionInput(BaseModel):
    topic: Optional[str] = None
    type: Optional[str] = "choice"
    currentText: Optional[str] = None
    wishes: Optional[str] = None
    format: Optional[str] = None
    reroll: Optional[bool] = None


class ImproveQuestionInput(BaseModel):
    currentText: str
    format: str = "quiz-choice"
    topic: Optional[str] = None
    wishes: Optional[str] = None
    reroll: Optional[bool] = None


class GenerateQuizInput(BaseModel):
    topic: Optional[str] = None
    count: Optional[int] = 10
    wishes: Optional[str] = None


class GenerateJeopardyCategoriesInput(BaseModel):
    topic: Optional[str] = None
    wishes: Optional[str] = None


class GenerateJeopardyQuestionsInput(BaseModel):
    category: str
    emptySlots: List[int] = [100, 200, 300, 400, 500]
    wishes: Optional[str] = None


# ---------- Routes ----------

@router.post("/generate-question", response_model=dict)
async def generate_question(input: GenerateQuestionInput, user=Depends(get_current_user)):
    check_ai_limit(user)
    # Определить тип из format
    qtype = input.type or "choice"
    fmt = input.format or ""
    if fmt == "quiz-matching":
        qtype = "matching"
    elif fmt == "quiz-close":
        qtype = "close"
    elif fmt == "quiz-ordering":
        qtype = "ordering"
    elif fmt == "quiz-bool":
        qtype = "bool"
    elif fmt == "quiz-text":
        qtype = "text"
    
    print(f"[AI] generate_question called: topic={input.topic!r}, type={qtype!r}")

    if input.currentText and input.currentText.strip():
        prompt = improve_question_prompt(
            current_text=input.currentText,
            format_type=input.format or input.type or "quiz-choice",
            topic=input.topic,
            wishes=input.wishes,
        )
        raw = await call_openai(prompt)
        if not raw or not raw.strip():
            return {"error": "Empty response from AI"}
        try:
            result = json.loads(clean_json(raw)) if isinstance(raw, str) else raw
            variants = normalize_variants(result)
            return {"variants": variants}
        except json.JSONDecodeError:
            return {"error": "Invalid JSON", "raw": raw[:500]}

    prompt = generate_question_prompt(
        topic=input.topic or "общая эрудиция",
        question_type=qtype,
        difficulty="mixed",
        wishes=input.wishes,
        count=3,
    )
    raw = await call_openai(prompt)
    if not raw or not raw.strip():
        return {"error": "Empty response from AI"}
    try:
        result = json.loads(clean_json(raw)) if isinstance(raw, str) else raw
        variants = normalize_variants(result)
        return {"variants": variants}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON", "raw": raw[:500]}


@router.post("/improve-question", response_model=dict)
async def improve_question(input: ImproveQuestionInput, user=Depends(get_current_user)):
    check_ai_limit(user)
    prompt = improve_question_prompt(
        current_text=input.currentText,
        format_type=input.format,
        topic=input.topic,
        wishes=input.wishes,
    )
    raw = await call_openai(prompt)
    if not raw or not raw.strip():
        return {"error": "Empty response from AI"}
    try:
        result = json.loads(clean_json(raw)) if isinstance(raw, str) else raw
        variants = normalize_variants(result)
        return {"variants": variants}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON", "raw": raw[:500]}


@router.post("/generate-quiz", response_model=dict)
async def generate_quiz(input: GenerateQuizInput, user=Depends(get_current_user)):
    check_ai_limit(user)
    prompt = generate_quiz_prompt(
        topic=input.topic or "Удивительные открытия",
        count=min(20, max(5, input.count or 10)),
        wishes=input.wishes,
    )
    raw = await call_openai(prompt)
    if not raw or not raw.strip():
        return {"error": "Empty response from AI"}
    try:
        return json.loads(clean_json(raw)) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return {"error": "Invalid JSON", "raw": raw[:500]}


@router.post("/generate-jeopardy-categories", response_model=dict)
async def generate_jeopardy_categories(input: GenerateJeopardyCategoriesInput, user=Depends(get_current_user)):
    check_ai_limit(user)
    prompt = generate_jeopardy_categories_prompt(
        topic=input.topic or "Удивительные явления",
        wishes=input.wishes,
    )
    raw = await call_openai(prompt)
    if not raw or not raw.strip():
        return {"error": "Empty response from AI"}
    try:
        return json.loads(clean_json(raw)) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return {"error": "Invalid JSON", "raw": raw[:500]}


@router.post("/generate-jeopardy-questions", response_model=dict)
async def generate_jeopardy_questions(input: GenerateJeopardyQuestionsInput, user=Depends(get_current_user)):
    check_ai_limit(user)
    prompt = generate_jeopardy_questions_prompt(
        category=input.category,
        empty_slots=input.emptySlots,
        wishes=input.wishes,
    )
    raw = await call_openai(prompt)
    if not raw or not raw.strip():
        return {"error": "Empty response from AI"}
    try:
        return json.loads(clean_json(raw)) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return {"error": "Invalid JSON", "raw": raw[:500]}


@router.post("/generate-from-file")
async def generate_from_file(
    file: UploadFile = File(...),
    count: int = Form(10),
    wishes: str = Form(""),
):
    text = ""
    filename = file.filename.lower() if file.filename else ""
    
    try:
        content = await file.read()
        
        if filename.endswith(".pdf"):
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        
        elif filename.endswith(".docx"):
            doc = Document(io.BytesIO(content))
            text = "\n".join(p.text for p in doc.paragraphs)
        
        elif filename.endswith((".txt", ".md")):
            text = content.decode("utf-8")
        
        else:
            return {"error": "Неподдерживаемый формат. PDF, DOCX, TXT, MD."}
    
    except Exception as e:
        return {"error": f"Ошибка чтения файла: {str(e)}"}
    
    if not text.strip():
        return {"error": "Не удалось извлечь текст."}
    
    text = text[:5000]
    
    prompt = generate_quiz_prompt(
        topic=text,
        count=count,
        wishes=wishes,
    )
    
    raw = await call_openai(prompt)
    if not raw or not raw.strip():
        return {"error": "AI не ответил"}
    
    try:
        return json.loads(clean_json(raw)) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return {"error": "Ошибка парсинга", "raw": raw[:500]}