import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login, register, isLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/app", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (mode === "login") {
        await login({
          email: form.email,
          password: form.password,
        });
      } else {
        await register(form);
      }
      navigate("/app", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Не удалось выполнить запрос.");
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <span className="eyebrow">Магистерская работа</span>
        <h1>Air Monitor Lab</h1>
        <p>
          Веб-интерфейс для сбора наблюдений, подготовки датасетов, обучения моделей, построения прогнозов и анализа экспериментов
          по качеству воздуха в Норильском промышленном районе.
        </p>
        <div className="hero-points">
          <div>
            <strong>Все этапы в одном месте</strong>
            <span>Сбор данных, подготовка датасетов, обучение, прогноз и оценка доступны в одном интерфейсе.</span>
          </div>
          <div>
            <strong>Понятный рабочий поток</strong>
            <span>Каждый этап вынесен в отдельный экран, чтобы не приходилось разбираться в API вручную.</span>
          </div>
          <div>
            <strong>Работа поверх текущего backend</strong>
            <span>Интерфейс использует существующий Django Ninja API и очереди задач без отдельной админки.</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "tab-button tab-button-active" : "tab-button"} onClick={() => setMode("login")}>
            Вход
          </button>
          <button
            type="button"
            className={mode === "register" ? "tab-button tab-button-active" : "tab-button"}
            onClick={() => setMode("register")}
          >
            Регистрация
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <>
              <label>
                <span>Имя</span>
                <input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} />
              </label>
              <label>
                <span>Фамилия</span>
                <input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
              </label>
            </>
          ) : null}

          <label className="full-span">
            <span>Электронная почта</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
              placeholder="ivanov@npr.local"
            />
          </label>

          <label className="full-span">
            <span>Пароль</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
              placeholder="Минимум 8 символов"
            />
          </label>

          {error ? <div className="form-alert">{error}</div> : null}

          <button type="submit" className="primary-button full-span" disabled={isLoading}>
            {isLoading ? "Обработка..." : mode === "login" ? "Войти в систему" : "Создать аккаунт"}
          </button>
        </form>
      </section>
    </div>
  );
}
