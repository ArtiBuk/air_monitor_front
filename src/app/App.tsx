import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { useAuth, AuthProvider } from "../hooks/useAuth";
import { TaskTrackerProvider } from "../hooks/useTaskTracker";
import { ThemeProvider } from "../hooks/useTheme";

const DashboardPage = lazy(() => import("../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const AirMapPage = lazy(() => import("../pages/AirMapPage").then((module) => ({ default: module.AirMapPage })));
const DatasetsPage = lazy(() => import("../pages/DatasetsPage").then((module) => ({ default: module.DatasetsPage })));
const ExperimentsPage = lazy(() => import("../pages/ExperimentsPage").then((module) => ({ default: module.ExperimentsPage })));
const ForecastsPage = lazy(() => import("../pages/ForecastsPage").then((module) => ({ default: module.ForecastsPage })));
const LoginPage = lazy(() => import("../pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const ModelsPage = lazy(() => import("../pages/ModelsPage").then((module) => ({ default: module.ModelsPage })));
const ObservationsPage = lazy(() => import("../pages/ObservationsPage").then((module) => ({ default: module.ObservationsPage })));
const TasksPage = lazy(() => import("../pages/TasksPage").then((module) => ({ default: module.TasksPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="loading-screen">
      <span className="loading-spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen label="Загрузка интерфейса..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

function RouterTree() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen label="Загрузка экрана..." />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<ProtectedRoute />}>
            <Route index element={<DashboardPage />} />
            <Route path="air-map" element={<AirMapPage />} />
            <Route path="observations" element={<ObservationsPage />} />
            <Route path="datasets" element={<DatasetsPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="forecasts" element={<ForecastsPage />} />
            <Route path="experiments" element={<ExperimentsPage />} />
            <Route path="tasks" element={<TasksPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TaskTrackerProvider>
            <RouterTree />
          </TaskTrackerProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
