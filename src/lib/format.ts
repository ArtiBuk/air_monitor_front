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

const metricLabels: Record<string, string> = {
  aqi: "Индекс качества воздуха (AQI)",
  mycityair_aqi_mean: "Индекс качества воздуха (AQI)",
  mycityair_aqi_max: "Максимальный AQI",
  mycityair_aqi_min: "Минимальный AQI",
  plume_index: "Сводный индекс загрязнения",
  pm25: "Мелкие частицы PM2.5",
  plume_pm25: "Мелкие частицы PM2.5",
  pm10: "Взвешенные частицы PM10",
  plume_pm10: "Взвешенные частицы PM10",
  no2: "Диоксид азота",
  plume_no2: "Диоксид азота",
  so2: "Диоксид серы",
  plume_so2: "Диоксид серы",
  o3: "Озон",
  plume_o3: "Озон",
  co: "Монооксид углерода",
  plume_co: "Монооксид углерода",
  mycityair_station_count: "Количество станций MyCityAir",
  mycityair_obs_count: "Количество наблюдений MyCityAir",
  missing_count_total: "Количество пропусков",
  missing_ratio_total: "Доля пропусков",
  hour_sin: "Час суток (sin)",
  hour_cos: "Час суток (cos)",
  weekday_sin: "День недели (sin)",
  weekday_cos: "День недели (cos)",
  month_sin: "Месяц (sin)",
  month_cos: "Месяц (cos)",
  day_of_year_sin: "День года (sin)",
  day_of_year_cos: "День года (cos)",
  is_weekend: "Выходной день",
};

const sourceLabels: Record<string, string> = {
  mycityair: "MyCityAir",
  plumelabs: "Plume Labs",
};

const metricThresholds: Record<string, { normal: number; elevated: number }> = {
  aqi: { normal: 50, elevated: 100 },
  mycityair_aqi_mean: { normal: 50, elevated: 100 },
  mycityair_aqi_max: { normal: 50, elevated: 100 },
  mycityair_aqi_min: { normal: 50, elevated: 100 },
  plume_index: { normal: 25, elevated: 50 },
  pm25: { normal: 15, elevated: 35 },
  plume_pm25: { normal: 15, elevated: 35 },
  pm10: { normal: 45, elevated: 90 },
  plume_pm10: { normal: 45, elevated: 90 },
  no2: { normal: 40, elevated: 100 },
  plume_no2: { normal: 40, elevated: 100 },
  so2: { normal: 20, elevated: 75 },
  plume_so2: { normal: 20, elevated: 75 },
  o3: { normal: 60, elevated: 120 },
  plume_o3: { normal: 60, elevated: 120 },
  co: { normal: 4, elevated: 9 },
  plume_co: { normal: 4, elevated: 9 },
};

const myCityAirAqiThresholds = { normal: 3, elevated: 6 };
const myCityAirAqiMetrics = new Set(["aqi", "mycityair_aqi_mean", "mycityair_aqi_max", "mycityair_aqi_min"]);

export type MetricSeverity = "normal" | "elevated" | "critical" | "unknown";

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

export function formatIsoDateTime(value: string | null | undefined, fallback = "-"): string {
  if (!value) {
    return fallback;
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

export function formatMetricName(value: string | null | undefined, fallback = "-"): string {
  if (!value) {
    return fallback;
  }

  if (value in metricLabels) {
    return metricLabels[value];
  }

  if (value.endsWith("_missing")) {
    const baseMetric = value.slice(0, -8);
    return `${formatMetricName(baseMetric, baseMetric)} · признак пропуска`;
  }

  if (value.startsWith("plume_")) {
    return formatMetricName(value.slice(6), value.slice(6));
  }

  return value.replace(/[_-]+/g, " ");
}

export function formatMetricList(values: string[] | null | undefined, fallback = "-"): string {
  return values && values.length ? values.map((item) => formatMetricName(item, item)).join(", ") : fallback;
}

export function formatSourceName(value: string | null | undefined, fallback = "-"): string {
  if (!value) {
    return fallback;
  }

  return sourceLabels[value] ?? value;
}

export function formatSourceList(values: string[] | null | undefined, fallback = "-"): string {
  return values && values.length ? values.map((item) => formatSourceName(item, item)).join(", ") : fallback;
}

export function getMetricSeverity(metric: string | null | undefined, value: number | null | undefined): MetricSeverity {
  if (!metric || value === null || value === undefined || Number.isNaN(value)) {
    return "unknown";
  }

  const thresholds = myCityAirAqiMetrics.has(metric) && value <= 10 ? myCityAirAqiThresholds : metricThresholds[metric];
  if (!thresholds) {
    return "unknown";
  }

  if (value <= thresholds.normal) {
    return "normal";
  }

  if (value <= thresholds.elevated) {
    return "elevated";
  }

  return "critical";
}

export function getMetricSeverityLabel(severity: MetricSeverity): string {
  const labels: Record<MetricSeverity, string> = {
    normal: "Норма",
    elevated: "Выше нормы",
    critical: "Критический",
    unknown: "Нет оценки",
  };

  return labels[severity];
}

export function getMetricSeverityRank(severity: MetricSeverity): number {
  const ranks: Record<MetricSeverity, number> = {
    unknown: 0,
    normal: 1,
    elevated: 2,
    critical: 3,
  };

  return ranks[severity];
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
