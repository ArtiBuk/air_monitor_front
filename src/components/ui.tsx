import type { ChangeEventHandler, PropsWithChildren, ReactNode } from "react";
import { motion } from "framer-motion";

import { cn } from "../lib/cn";
import {
  asObject,
  formatFullDateTime,
  formatMetricList,
  formatNumber,
  formatPercent,
  getNestedMetric,
  type MetricSeverity,
} from "../lib/format";
import type { DatasetSnapshot, ModelLeaderboardEntry, ModelVersion } from "../types/api";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <motion.div
      className="page-header"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="page-header-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </motion.div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  className = "",
  children,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <motion.section
      className={cn("panel", className)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </motion.section>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "accent" | "warm";
}) {
  return (
    <motion.div
      className={cn("metric-card", tone === "accent" && "metric-card-accent", tone === "warm" && "metric-card-warm")}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </motion.div>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = String(status ?? "unknown").toLowerCase();
  const labels: Record<string, string> = {
    ready: "готово",
    success: "успешно",
    completed: "завершено",
    active: "активна",
    started: "запущена",
    failed: "ошибка",
    cancelled: "отменено",
    scheduled: "запланировано",
    queued: "в очереди",
    pending: "ожидание",
    running: "выполняется",
    processing: "обработка",
    unknown: "неизвестно",
    idle: "неактивна",
    raw: "сырые",
  };
  const className =
    normalized === "ready" || normalized === "success" || normalized === "completed" || normalized === "active"
      ? "status status-ok"
      : normalized === "failed" || normalized === "cancelled"
        ? "status status-danger"
      : "status status-warn";

  return <span className={className}>{labels[normalized] ?? String(status ?? "неизвестно")}</span>;
}

export function SeverityBadge({ severity }: { severity: MetricSeverity }) {
  const labels: Record<MetricSeverity, string> = {
    normal: "Норма",
    elevated: "Выше нормы",
    critical: "Критический",
    unknown: "Без оценки",
  };

  return (
    <span className={cn("severity-badge", `severity-${severity}`)}>
      <span className={cn("severity-dot", `severity-dot-${severity}`)} aria-hidden />
      {labels[severity]}
    </span>
  );
}

export function JsonPreview({ value }: { value: unknown }) {
  return <pre className="json-preview">{JSON.stringify(value, null, 2)}</pre>;
}

export function ScheduleField({
  value,
  onChange,
  hint = "Оставь пустым для немедленного старта. Если указать дату, backend создаст отложенную задачу.",
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  hint?: string;
}) {
  return (
    <label className="full-span">
      <span>Запланировать на</span>
      <input type="datetime-local" value={value} onChange={onChange} />
      <FieldHint>{hint}</FieldHint>
    </label>
  );
}

export function FieldHint({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <small className={cn("field-hint", className)}>{children}</small>;
}

export function ActionHint({ children }: PropsWithChildren) {
  return <div className="action-hint">{children}</div>;
}

export function OperationResult({
  title,
  status,
  items,
  raw,
}: {
  title: string;
  status?: string | null;
  items: Array<{ label: string; value: ReactNode }>;
  raw?: unknown;
}) {
  return (
    <div className="result-card">
      <div className="result-head">
        <strong>{title}</strong>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      <div className="result-grid">
        {items.map((item) => (
          <div key={item.label} className="result-item">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {raw ? (
        <details className="result-raw">
          <summary>Показать сырой ответ</summary>
          <JsonPreview value={raw} />
        </details>
      ) : null}
    </div>
  );
}

export function FormMessage({
  tone = "info",
  children,
}: PropsWithChildren<{
  tone?: "info" | "error";
}>) {
  return <div className={cn("form-message", tone === "error" ? "form-message-error" : "form-message-info")}>{children}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function KeyMetricRow({
  label,
  value,
  variant = "number",
}: {
  label: string;
  value: number | null;
  variant?: "number" | "percent";
}) {
  return (
    <div className="key-metric-row">
      <span>{label}</span>
      <strong>{variant === "percent" ? formatPercent(value) : formatNumber(value)}</strong>
    </div>
  );
}

export function ActiveModelOverview({
  model,
  dataset,
  leaderboardEntry,
}: {
  model: ModelVersion;
  dataset?: DatasetSnapshot | null;
  leaderboardEntry?: ModelLeaderboardEntry | null;
}) {
  const metrics = asObject(model.metrics);
  const rmse = leaderboardEntry?.avg_overall_rmse ?? getNestedMetric(metrics, "summary", "overall_rmse");
  const mae = leaderboardEntry?.avg_overall_mae ?? getNestedMetric(metrics, "summary", "overall_mae");
  const mape = leaderboardEntry?.avg_macro_mape ?? getNestedMetric(metrics, "summary", "macro_mape");
  const coverage = leaderboardEntry?.avg_coverage_ratio ?? null;
  const metricSourceLabel = leaderboardEntry?.metric_source === "backtest" ? "ретропроверка" : "test split";
  const productionLabel = leaderboardEntry ? `#${leaderboardEntry.rank} в production-рейтинге` : "готова для production";

  return (
    <div className="model-spotlight">
      <div className="model-spotlight-copy">
        <div className="inline-summary">
          <StatusBadge status={model.status} />
          <span className="pill">{productionLabel}</span>
          <span className="pill">метрики: {metricSourceLabel}</span>
        </div>
        <strong>{model.name}</strong>
        <p>
          Модель использует окно {model.input_len_hours}ч и строит прогноз на {model.forecast_horizon_hours}ч. В hourly
          pipeline приоритет идёт по ошибкам RMSE/MAE/MAPE, а затем по объёму датасета.
        </p>
        <div className="model-target-inline">
          <span>Целевые показатели</span>
          <p>{formatMetricList(model.target_names)}</p>
        </div>
      </div>

      <div className="model-score-grid">
        <div className="model-score-card">
          <span>RMSE</span>
          <strong>{formatNumber(rmse)}</strong>
          <small>чем ниже, тем лучше</small>
        </div>
        <div className="model-score-card">
          <span>MAE</span>
          <strong>{formatNumber(mae)}</strong>
          <small>средняя абсолютная ошибка</small>
        </div>
        <div className="model-score-card">
          <span>MAPE</span>
          <strong>{formatNumber(mape)}</strong>
          <small>относительная ошибка</small>
        </div>
        <div className="model-score-card">
          <span>Покрытие / backtests</span>
          <strong>
            {leaderboardEntry ? `${formatPercent(coverage)} · ${formatNumber(leaderboardEntry.evaluation_count, "0")}` : "-"}
          </strong>
          <small>{leaderboardEntry ? "среднее покрытие и число ретропроверок" : "появится после оценки прогнозов"}</small>
        </div>
      </div>

      <div className="model-spec-grid">
        <div className="model-spec-card">
          <span>Сэмплы датасета</span>
          <strong>{formatNumber(dataset?.sample_count ?? leaderboardEntry?.dataset_sample_count ?? null, "0")}</strong>
        </div>
        <div className="model-spec-card">
          <span>Часов в master frame</span>
          <strong>{formatNumber(dataset?.master_row_count ?? leaderboardEntry?.dataset_master_row_count ?? null, "0")}</strong>
        </div>
        <div className="model-spec-card">
          <span>Признаков / целей</span>
          <strong>
            {model.feature_names.length} / {model.target_names.length}
          </strong>
        </div>
        <div className="model-spec-card">
          <span>Создана</span>
          <strong>{formatFullDateTime(model.created_at)}</strong>
        </div>
      </div>
    </div>
  );
}

export function Table({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index}>
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SmallMeta({
  createdAt,
  updatedLabel,
}: {
  createdAt: string | null | undefined;
  updatedLabel?: string;
}) {
  return (
    <div className="small-meta">
      <span>{updatedLabel ?? "Обновлено"}:</span>
      <strong>{formatFullDateTime(createdAt)}</strong>
    </div>
  );
}
