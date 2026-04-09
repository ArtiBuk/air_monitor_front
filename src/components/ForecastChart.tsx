import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useTheme } from "../hooks/useTheme";
import { cn } from "../lib/cn";
import { formatDateTime, formatMetricName, formatNumber, getMetricSeverity } from "../lib/format";
import type { ForecastRecord } from "../types/api";
import { EmptyState, SeverityBadge } from "./ui";

export function ForecastChart({ records, variant = "detailed" }: { records: ForecastRecord[]; variant?: "detailed" | "compact" }) {
  const { theme } = useTheme();
  const priority = ["mycityair_aqi_mean", "plume_index", "plume_pm25", "plume_pm10", "plume_no2", "plume_o3", "plume_so2", "plume_co"];
  const metricKeys = Object.keys(records[0]?.values ?? {})
    .sort((left, right) => {
      const leftPriority = priority.indexOf(left);
      const rightPriority = priority.indexOf(right);
      const normalizedLeftPriority = leftPriority === -1 ? 99 : leftPriority;
      const normalizedRightPriority = rightPriority === -1 ? 99 : rightPriority;
      if (normalizedLeftPriority !== normalizedRightPriority) {
        return normalizedLeftPriority - normalizedRightPriority;
      }
      const leftAqiPriority = left === "mycityair_aqi_mean" ? 0 : 1;
      const rightAqiPriority = right === "mycityair_aqi_mean" ? 0 : 1;
      if (leftAqiPriority !== rightAqiPriority) {
        return leftAqiPriority - rightAqiPriority;
      }
      return left.localeCompare(right);
    });
  const palette = ["#f4a259", "#7dd3c7", "#7cb4ff", "#f472b6", "#c084fc", "#34d399", "#f59e0b", "#60a5fa"];

  if (!records.length || !metricKeys.length) {
    return <EmptyState title="Нет рядов для графика" description="Сначала получите успешный прогноз с ненулевыми значениями." />;
  }

  const series = metricKeys.map((key, index) => {
    const data = records.map((record) => ({
      timestamp: formatDateTime(record.timestamp_utc),
      value: record.values[key],
    }));
    const values = data.map((item) => item.value).filter((value) => Number.isFinite(value));
    const latest = values.at(-1) ?? null;
    const min = values.length ? Math.min(...values) : null;
    const max = values.length ? Math.max(...values) : null;

    return {
      key,
      color: palette[index % palette.length],
      data,
      latest,
      min,
      max,
    };
  });
  const chartGridColor = theme === "light" ? "rgba(58, 77, 89, 0.14)" : "rgba(191, 208, 214, 0.12)";
  const chartTickColor = theme === "light" ? "#516875" : "#8fa6b0";
  const tooltipBackground = theme === "light" ? "rgba(255,255,255,0.96)" : "rgba(15,23,29,0.96)";
  const tooltipBorder = theme === "light" ? "1px solid rgba(58,77,89,0.14)" : "1px solid rgba(143,166,176,0.18)";
  const tooltipColor = theme === "light" ? "#14202a" : "#eef4f6";

  return (
    <div className={cn("chart-stack", variant === "compact" && "chart-stack-compact")}>
      {variant === "detailed" ? (
        <div className="chart-summary-grid">
          {series.map((metric) => {
            const severity = getMetricSeverity(metric.key, metric.latest);
            return (
              <div key={metric.key} className={cn("chart-stat-card", `chart-stat-card-${severity}`)}>
                <span>{formatMetricName(metric.key, metric.key)}</span>
                <strong>{formatNumber(metric.latest)}</strong>
                <small>
                  мин. {formatNumber(metric.min)} · макс. {formatNumber(metric.max)}
                </small>
                <div className="chart-stat-foot">
                  <SeverityBadge severity={severity} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className={cn("mini-chart-grid", variant === "compact" && "mini-chart-grid-compact")}>
        {series.map((metric) => {
          const severity = getMetricSeverity(metric.key, metric.latest);
          return (
            <div key={metric.key} className="mini-chart-card">
              <div className="mini-chart-head">
                <div className="mini-chart-title">
                  <span className="chart-dot" style={{ backgroundColor: metric.color }} />
                  <strong>{formatMetricName(metric.key, metric.key)}</strong>
                </div>
                <div className="mini-chart-meta">
                  <span>{formatNumber(metric.latest)}</span>
                  <SeverityBadge severity={severity} />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={variant === "compact" ? 156 : 184}>
                <LineChart data={metric.data}>
                  <CartesianGrid stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="timestamp" tick={{ fill: chartTickColor, fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fill: chartTickColor, fontSize: 11 }} width={44} tickFormatter={(value: number) => formatNumber(value)} />
                  <Tooltip
                    formatter={(value) => formatNumber(typeof value === "number" ? value : null)}
                    contentStyle={{
                      borderRadius: 14,
                      border: tooltipBorder,
                      background: tooltipBackground,
                      color: tooltipColor,
                      boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
                    }}
                  />
                  <Line type="monotone" dataKey="value" stroke={metric.color} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
      <div className="chart-caption">
        <span>Метрик: {metricKeys.length}</span>
        <span>Точек: {records.length}</span>
      </div>
    </div>
  );
}
