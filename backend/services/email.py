import os
import resend

resend.api_key = os.getenv("RESEND_API_KEY")

def send_reset_email(to_email: str, token: str):
    reset_url = f"https://islandquiz.online/reset-password?token={token}"
    
    resend.Emails.send({
        "from": "IslandQuiz <support@islandquiz.online>",
        "to": to_email,
        "subject": "Сброс пароля — IslandQuiz",
        "html": f"""
            <h2>Сброс пароля</h2>
            <p>Вы запросили сброс пароля на IslandQuiz.</p>
            <p>Перейдите по ссылке чтобы установить новый пароль:</p>
            <a href="{reset_url}">{reset_url}</a>
            <p>Ссылка действительна 1 час.</p>
            <hr>
            <p style="color:#888">Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
        """
    })