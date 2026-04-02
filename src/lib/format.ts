import type { JsonObject } from "../types/api";

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const fullDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("ru-RU", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date);
}

export function formatFullDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return fullDateFormatter.format(date);
}

export function formatNumber(value: number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return numberFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return percentFormatter.format(value);
}

export function parseCsvList(value: string): string[] | null {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items : null;
}

export function toDateTimeLocalValue(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function joinList(values: string[] | null | undefined, fallback = "-"): string {
  return values && values.length ? values.join(", ") : fallback;
}

export function humanizeOperation(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const normalized = value.toLowerCase();
  const labels: Record<string, string> = {
    collect_observations: "Сбор наблюдений",
    build_dataset: "Сборка датасета",
    train_model: "Обучение модели",
    generate_forecast: "Построение прогноза",
    evaluate_forecast: "Оценка прогноза",
    run_experiment: "Запуск эксперимента",
    external_task: "Внешняя задача",
    "внешняя_задача": "Внешняя задача",
  };

  if (normalized in labels) {
    return labels[normalized];
  }

  return value.replace(/[_-]+/g, " ");
}

export function asObject(value: unknown): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as JsonObject;
}

export function getNestedMetric(source: JsonObject | undefined, ...path: string[]): number | null {
  let current: unknown = source;

  for (const key of path) {
    if (!current || Array.isArray(current) || typeof current !== "object" || !(key in current)) {
      return null;
    }

    current = (current as JsonObject)[key];
  }

  return typeof current === "number" ? current : null;
}
