import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Политика конфиденциальности — IslandQuiz" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          ← На главную
        </Link>
        <h1 className="font-display text-3xl font-black">Политика конфиденциальности</h1>
        <p className="mt-1 text-muted-foreground">Дата обновления: 21 июля 2026 г.</p>

        <section className="mt-8">
          <h2 className="font-display text-lg font-bold mb-2">1. Общие положения</h2>
          <p>Настоящая политика обработки персональных данных составлена в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» и определяет порядок обработки персональных данных и меры по обеспечению безопасности персональных данных, предпринимаемые оператором сервиса IslandQuiz (далее — Оператор).</p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">2. Какие данные мы собираем</h2>
          <p>При регистрации мы запрашиваем email и имя. Дополнительно вы можете указать аватар, краткую информацию о себе и предмет. При использовании сервиса мы сохраняем:</p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>Созданные вами игры и вопросы</li>
            <li>Результаты прохождения игр</li>
            <li>Оценки и рейтинги</li>
            <li>Технические данные (IP-адрес, тип браузера) необходимые для работы сервиса</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">3. Цели обработки данных</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Предоставление доступа к функционалу сервиса</li>
            <li>Сохранение созданных игр и результатов прохождений</li>
            <li>Отображение публичных игр и рейтингов</li>
            <li>Связь с пользователем (ответы на обращения)</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">4. Хранение и безопасность</h2>
          <p>Данные хранятся в облачной базе данных Supabase (PostgreSQL) на серверах в Европейском союзе. Мы принимаем необходимые организационные и технические меры для защиты данных от несанкционированного доступа.</p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">5. Передача данных третьим лицам</h2>
          <p>Мы не передаём ваши персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ. Данные могут передаваться только в объёме, необходимом для работы сервиса (хостинг, база данных).</p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">6. Трансграничная передача</h2>
          <p>До начала трансграничной передачи персональных данных Оператор обязан убедиться в том, что иностранным государством, на территорию которого предполагается осуществлять передачу персональных данных, обеспечивается надёжная защита прав субъектов персональных данных.</p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">7. Ваши права</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Получать информацию об обработке ваших данных</li>
            <li>Требовать уточнения, блокировки или уничтожения данных</li>
            <li>Отозвать согласие на обработку данных</li>
            <li>Обжаловать действия Оператора в уполномоченном органе</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">8. Удаление данных</h2>
          <p>Вы можете удалить свой аккаунт и все связанные данные, направив запрос на почту Оператора. Данные будут удалены в течение 30 дней.</p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">9. Cookies</h2>
          <p>Мы используем только технические cookies, необходимые для авторизации (JWT токен). Никаких отслеживающих или рекламных cookies.</p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">10. Изменения политики</h2>
          <p>Мы оставляем за собой право вносить изменения в настоящую политику. Актуальная версия всегда доступна по адресу https://islandquiz.pages.dev/privacy.</p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold mb-2">11. Контакты</h2>
          <p>По всем вопросам: <a href="mailto:support@islandquiz.ru" className="text-primary hover:underline">support@islandquiz.ru</a></p>
        </section>
      </main>
    </div>
  );
}