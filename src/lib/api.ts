import type {
  AsyncTaskLaunch,
  AsyncTaskStatus,
  AuthSession,
  BuildDatasetPayload,
  CollectObservationsPayload,
  CreateExperimentSeriesPayload,
  DatasetSnapshot,
  ExperimentRun,
  ExperimentSeries,
  ExperimentSeriesReport,
  ForecastEvaluation,
  ForecastGeneratePayload,
  ForecastRun,
  LoginPayload,
  MessageResponse,
  ModelLeaderboardEntry,
  ModelVersion,
  Observation,
  ObservationSyncResult,
  RegisterPayload,
  RunExperimentPayload,
  ScheduledTask,
  TrainModelPayload,
  User,
} from "../types/api";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getApiErrorMessage(error: unknown, fallback = "Запрос завершился с ошибкой.") {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

let refreshPromise: Promise<boolean> | null = null;

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

function withQuery(path: string, params: Record<string, string | number | Array<string> | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        searchParams.append(key, item);
      }
      continue;
    }

    searchParams.set(key, String(rawValue));
  }

  const search = searchParams.toString();
  return search ? `${path}?${search}` : path;
}

function canRefresh(path: string) {
  return !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/register") && !path.startsWith("/api/auth/refresh");
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function request<T>(path: string, init: RequestOptions = {}, retryOnAuth = true): Promise<T> {
  const headers = new Headers(init.headers);
  const rawBody = init.body;
  const hasNativeBody =
    typeof rawBody === "string" ||
    rawBody instanceof FormData ||
    rawBody instanceof URLSearchParams ||
    rawBody instanceof Blob ||
    rawBody instanceof ArrayBuffer;
  const hasObjectBody = rawBody !== null && rawBody !== undefined && !hasNativeBody;

  if (hasObjectBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    body: hasObjectBody ? JSON.stringify(rawBody) : (rawBody as BodyInit | undefined),
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retryOnAuth && canRefresh(path)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? ((await response.json()) as T | MessageResponse) : null;

  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? String(data.detail) : "Request failed.";
    throw new ApiError(response.status, detail);
  }

  return data as T;
}

export const api = {
  login: (payload: LoginPayload) => request<AuthSession>("/api/auth/login", { method: "POST", body: payload }, false),
  register: (payload: RegisterPayload) =>
    request<AuthSession>("/api/auth/register", { method: "POST", body: payload }, false),
  logout: () => request<MessageResponse>("/api/auth/logout", { method: "POST", body: {} }, false),
  me: () => request<User>("/api/users/me"),
  listObservations: (params: { metric?: string; source?: string; limit?: number }) =>
    request<Observation[]>(withQuery("/api/monitoring/observations", params)),
  collectObservations: (payload: CollectObservationsPayload) =>
    request<ObservationSyncResult>("/api/monitoring/observations/collect", { method: "POST", body: payload }),
  collectObservationsAsync: (payload: CollectObservationsPayload) =>
    request<AsyncTaskLaunch>("/api/monitoring/observations/collect/async", { method: "POST", body: payload }),
  listDatasets: (limit = 10) => request<DatasetSnapshot[]>(withQuery("/api/monitoring/datasets", { limit })),
  getDataset: (id: string) => request<DatasetSnapshot>(`/api/monitoring/datasets/${id}`),
  buildDataset: (payload: BuildDatasetPayload) =>
    request<DatasetSnapshot>("/api/monitoring/datasets/build", { method: "POST", body: payload }),
  buildDatasetAsync: (payload: BuildDatasetPayload) =>
    request<AsyncTaskLaunch>("/api/monitoring/datasets/build/async", { method: "POST", body: payload }),
  listModels: (limit = 10) => request<ModelVersion[]>(withQuery("/api/monitoring/models", { limit })),
  getActiveModel: () => request<ModelVersion>("/api/monitoring/models/active"),
  trainModel: (payload: TrainModelPayload) =>
    request<ModelVersion>("/api/monitoring/models/train", { method: "POST", body: payload }),
  trainModelAsync: (payload: TrainModelPayload) =>
    request<AsyncTaskLaunch>("/api/monitoring/models/train/async", { method: "POST", body: payload }),
  getModelLeaderboard: (metric = "overall_rmse", limit = 10) =>
    request<ModelLeaderboardEntry[]>(withQuery("/api/monitoring/models/leaderboard", { metric, limit })),
  listForecasts: (limit = 10) => request<ForecastRun[]>(withQuery("/api/monitoring/forecasts", { limit })),
  getLatestForecast: () => request<ForecastRun>("/api/monitoring/forecasts/latest"),
  getForecast: (id: string) => request<ForecastRun>(`/api/monitoring/forecasts/${id}`),
  generateForecast: (payload: ForecastGeneratePayload) =>
    request<ForecastRun>("/api/monitoring/forecasts/generate", { method: "POST", body: payload }),
  generateForecastAsync: (payload: ForecastGeneratePayload) =>
    request<AsyncTaskLaunch>("/api/monitoring/forecasts/generate/async", { method: "POST", body: payload }),
  backtestForecast: (payload: ForecastGeneratePayload) =>
    request<ForecastRun>("/api/monitoring/forecasts/backtest", { method: "POST", body: payload }),
  listEvaluations: (params: { limit?: number; model_version_id?: string | null }) =>
    request<ForecastEvaluation[]>(withQuery("/api/monitoring/forecasts/evaluations", params)),
  getEvaluation: (forecastRunId: string) =>
    request<ForecastEvaluation>(`/api/monitoring/forecasts/${forecastRunId}/evaluation`),
  evaluateForecast: (forecastRunId: string) =>
    request<ForecastEvaluation>(`/api/monitoring/forecasts/${forecastRunId}/evaluate`, { method: "POST" }),
  listExperimentRuns: (params: { limit?: number; series_id?: string | null }) =>
    request<ExperimentRun[]>(withQuery("/api/monitoring/experiments", params)),
  runExperiment: (payload: RunExperimentPayload) =>
    request<ExperimentRun>("/api/monitoring/experiments/run", { method: "POST", body: payload }),
  runExperimentAsync: (payload: RunExperimentPayload) =>
    request<AsyncTaskLaunch>("/api/monitoring/experiments/run/async", { method: "POST", body: payload }),
  listExperimentSeries: (limit = 10) => request<ExperimentSeries[]>(withQuery("/api/monitoring/experiment-series", { limit })),
  createExperimentSeries: (payload: CreateExperimentSeriesPayload) =>
    request<ExperimentSeries>("/api/monitoring/experiment-series", { method: "POST", body: payload }),
  getExperimentSeriesReport: (seriesId: string) =>
    request<ExperimentSeriesReport>(`/api/monitoring/experiment-series/${seriesId}/report`),
  getTaskStatus: (taskId: string) => request<AsyncTaskStatus>(`/api/monitoring/tasks/${taskId}`),
  listScheduledTasks: (params: { limit?: number; status?: string | null }) =>
    request<ScheduledTask[]>(withQuery("/api/monitoring/scheduled-tasks", params)),
  getScheduledTask: (scheduledTaskId: string) =>
    request<ScheduledTask>(`/api/monitoring/scheduled-tasks/${scheduledTaskId}`),
  cancelScheduledTask: (scheduledTaskId: string) =>
    request<ScheduledTask>(`/api/monitoring/scheduled-tasks/${scheduledTaskId}/cancel`, { method: "POST" }),
};
