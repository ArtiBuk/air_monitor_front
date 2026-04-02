import { Activity, BarChart3, Database, FlaskConical, Gauge, LogOut, Radar, Waves } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useTaskTracker } from "../hooks/useTaskTracker";

const navigation = [
  { to: "/app", label: "Обзор", icon: Gauge, end: true },
  { to: "/app/observations", label: "Наблюдения", icon: Waves },
  { to: "/app/datasets", label: "Датасеты", icon: Database },
  { to: "/app/models", label: "Модели", icon: BarChart3 },
  { to: "/app/forecasts", label: "Прогнозы", icon: Activity },
  { to: "/app/experiments", label: "Эксперименты", icon: FlaskConical },
  { to: "/app/tasks", label: "Задачи", icon: Radar },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { tasks } = useTaskTracker();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <div className="brand-mark">AM</div>
            <div>
              <strong>Air Monitor Lab</strong>
              <p>НПР · мониторинг · прогноз</p>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="user-chip">
              <span className="muted-label">Сессия</span>
              <strong>{user?.full_name || user?.email}</strong>
              <small>{tasks.length} задач в фокусе</small>
            </div>
            <button type="button" className="ghost-button" onClick={() => void logout()}>
              <LogOut size={16} />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      </header>

      <div className="shell-inner">
        <aside className="sidebar">
          <div className="sidebar-title">
            <span className="eyebrow">Навигация</span>
            <strong>Рабочие разделы</strong>
          </div>

          <nav className="nav-block">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="sidebar-foot">
            <div className="user-card">
              <span className="muted-label">Поток работы</span>
              <strong>Основные этапы</strong>
              <small>Наблюдения → Датасеты → Модели → Прогнозы → Эксперименты</small>
            </div>
          </div>
        </aside>

        <main className="content">
          <div className="content-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
