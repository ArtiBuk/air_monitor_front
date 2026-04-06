import { useQuery } from "@tanstack/react-query";

import { ApiError, api } from "../lib/api";
import {
  asObject,
  formatDateTime,
  formatIsoDateTime,
  formatMetricList,
  formatMetricName,
  formatNumber,
  formatSourceList,
  getMetricSeverity,
  getMetricSeverityLabel,
  getMetricSeverityRank,
  getNestedMetric,
} from "../lib/format";
import { EmptyState, ForecastChart, KeyMetricRow, MetricCard, PageHeader, Panel, SeverityBadge, SmallMeta, StatusBadge, Table } from "../components/ui";

async function queryOrNull<T>(loader: () => Promise<T>) {
  try {
    return await loader();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function DashboardPage() {
  const overviewQuery = useQuery({ queryKey: ["overview", "stats"], queryFn: () => api.getMonitoringOverview() });
  const observationsQuery = useQuery({ queryKey: ["overview", "observations"], queryFn: () => api.listObservations({ limit: 8 }) });
  const datasetsQuery = useQuery({ queryKey: ["overview", "datasets"], queryFn: () => api.listDatasets(6) });
  const modelsQuery = useQuery({ queryKey: ["overview", "models"], queryFn: () => api.listModels(6) });
  const forecastsQuery = useQuery({ queryKey: ["overview", "forecasts"], queryFn: () => api.listForecasts(6) });
  const experimentsQuery = useQuery({ queryKey: ["overview", "experiments"], queryFn: () => api.listExperimentRuns({ limit: 6 }) });
  const seriesQuery = useQuery({ queryKey: ["overview", "series"], queryFn: () => api.listExperimentSeries(6) });
  const activeModelQuery = useQuery({ queryKey: ["overview", "active-model"], queryFn: () => queryOrNull(() => api.getActiveModel()) });
  const latestForecastQuery = useQuery({ queryKey: ["overview", "latest-forecast"], queryFn: () => queryOrNull(() => api.getLatestForecast()) });
  const leaderboardQuery = useQuery({ queryKey: ["overview", "leaderboard"], queryFn: () => api.getModelLeaderboard("overall_rmse", 5) });

  const activeModelMetrics = asObject(activeModelQuery.data?.metrics);
  const latestForecast = latestForecastQuery.data;
  const leaderboard = leaderboardQuery.data ?? [];
  const counts = overviewQuery.data?.counts;
  const collectionConfig = overviewQuery.data?.automatic_collection;
  const latestForecastAqi = latestForecast?.records.at(-1)?.values?.mycityair_aqi_mean ?? null;
  const predictsAqi = activeModelQuery.data?.target_names.includes("mycityair_aqi_mean") ?? false;
  const latestForecastTimestamp = latestForecast?.records.at(-1)?.timestamp_utc ?? null;
  const latestForecastValues = latestForecast?.records.at(-1)?.values ?? {};
  const latestAqiSeverity = getMetricSeverity("mycityair_aqi_mean", latestForecastAqi);
  const dominantMetricEntry = Object.entries(latestForecastValues)
    .map(([metric, value]) => ({
      metric,
      value,
      severity: getMetricSeverity(metric, value),
      rank: getMetricSeverityRank(getMetricSeverity(metric, value)),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return right.rank - left.rank;
      }
      return (right.value ?? 0) - (left.value ?? 0);
    })[0];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Обзор лаборатории"
        title="Панель исследования качества воздуха"
        description="Главный экран по состоянию пайплайна: наблюдения, датасеты, модели, прогнозы и серии экспериментов в одном месте."
      />

      <section className="metrics-grid">
        <MetricCard label="Наблюдения" value={formatNumber(counts?.observations ?? 0, "0")} helper="всего в базе" tone="accent" />
        <MetricCard label="Датасеты" value={formatNumber(counts?.datasets ?? 0, "0")} helper="собранные срезы" />
        <MetricCard label="Модели" value={formatNumber(counts?.models ?? 0, "0")} helper="версии модели" />
        <MetricCard label="Прогнозы" value={formatNumber(counts?.forecasts ?? 0, "0")} helper="запуски прогноза" tone="warm" />
        <MetricCard label="Эксперименты" value={formatNumber(counts?.experiments ?? 0, "0")} helper="запуски исследования" />
        <MetricCard label="Серии" value={formatNumber(counts?.series ?? 0, "0")} helper="исследовательские кампании" />
      </section>

      <section className="aqi-strip">
        <div className={`aqi-main-card aqi-main-card-${latestAqiSeverity}`}>
          <div className="aqi-main-head">
            <div>
              <span className="eyebrow">Ключевой показатель</span>
              <strong>AQI</strong>
            </div>
            <SeverityBadge severity={latestAqiSeverity} />
          </div>
          <div className="aqi-main-value">{formatNumber(latestForecastAqi)}</div>
          <p className="panel-note">Итоговый индекс качества воздуха по последней точке прогноза.</p>
        </div>

        <div className="aqi-side-grid">
          <div className="aqi-side-card">
            <span>Категория</span>
            <strong>{getMetricSeverityLabel(latestAqiSeverity)}</strong>
          </div>
          <div className="aqi-side-card">
            <span>Последняя точка прогноза</span>
            <strong>{formatIsoDateTime(latestForecastTimestamp)}</strong>
          </div>
          <div className="aqi-side-card">
            <span>Доминирующий риск</span>
            <strong>
              {dominantMetricEntry ? `${formatMetricName(dominantMetricEntry.metric)} · ${getMetricSeverityLabel(dominantMetricEntry.severity)}` : "-"}
            </strong>
          </div>
          <div className="aqi-side-card">
            <span>Статус модели</span>
            <strong>{predictsAqi ? "AQI входит в цели модели" : "AQI не входит в цели модели"}</strong>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <Panel title="Последний прогноз" subtitle="Быстрый взгляд на временной ряд последнего успешного запуска прогноза.">
          {latestForecast ? (
            <>
              <div className="inline-summary">
                <StatusBadge status={latestForecast.status} />
                <SmallMeta createdAt={latestForecast.created_at} updatedLabel="Создан" />
              </div>
              <ForecastChart records={latestForecast.records} />
            </>
          ) : (
            <EmptyState title="Прогнозов пока нет" description="Сначала обучите модель и запустите генерацию прогноза на странице «Прогнозы»." />
          )}
        </Panel>

        <Panel title="Активная модель" subtitle="Текущая модель по умолчанию, которую backend использует при генерации прогноза.">
          {activeModelQuery.data ? (
            <div className="detail-stack">
              <div className="inline-summary">
                <StatusBadge status={activeModelQuery.data.status} />
                <span className="pill">{activeModelQuery.data.name}</span>
              </div>
              <KeyMetricRow label="Общая RMSE" value={getNestedMetric(activeModelMetrics, "summary", "overall_rmse")} />
              <KeyMetricRow label="Общая MAE" value={getNestedMetric(activeModelMetrics, "summary", "overall_mae")} />
              <KeyMetricRow label="Макро MAPE" value={getNestedMetric(activeModelMetrics, "summary", "macro_mape")} />
              <p className="panel-note">Цели: {formatMetricList(activeModelQuery.data.target_names)}</p>
            </div>
          ) : (
            <EmptyState title="Активная модель отсутствует" description="После первого успешного обучения backend автоматически выставит готовую модель активной." />
          )}
        </Panel>
      </div>

      <Panel
        title="Автосбор наблюдений"
        subtitle="Hourly-задача Celery теперь показывает реальное окно, из которого она каждый раз забирает данные."
      >
        <Table
          columns={["Параметр", "Значение"]}
          rows={[
            ["Запуск по расписанию", `каждый час в :${String(collectionConfig?.schedule_minute ?? 5).padStart(2, "0")}`],
            ["Запрашиваемое окно", `${collectionConfig?.lookback_hours ?? 48} ч назад от текущего момента`],
            ["Интервал агрегации", collectionConfig?.interval ?? "Interval1H"],
            ["Размер окна", `${collectionConfig?.window_hours ?? 1} ч`],
            ["Источники", formatSourceList(collectionConfig?.enabled_sources)],
          ]}
        />
      </Panel>

      <Panel title="Лидерборд моделей" subtitle="Сводная оценка по метрикам ретропроверки.">
        {leaderboard.length ? (
          <Table
            columns={["Модель", "Оценок", "RMSE", "MAE", "MAPE", "Активна"]}
            rows={leaderboard.map((item) => [
              item.model_name,
              formatNumber(item.evaluation_count),
              formatNumber(item.avg_overall_rmse),
              formatNumber(item.avg_overall_mae),
              formatNumber(item.avg_macro_mape),
              <StatusBadge status={item.is_active ? "active" : "idle"} />,
            ])}
          />
        ) : (
          <EmptyState title="Лидерборд пуст" description="Сначала нужны прогнозы с последующей оценкой, чтобы заполнить рейтинг моделей." />
        )}
      </Panel>

      <Panel title="Последние сущности" subtitle="Быстрый обзор актуальных объектов в системе.">
        <Table
          columns={["Тип", "Количество", "Последний статус / комментарий"]}
          rows={[
            ["Наблюдения", formatNumber(counts?.observations ?? 0, "0"), formatMetricName(observationsQuery.data?.[0]?.metric)],
            ["Срезы датасета", formatNumber(counts?.datasets ?? 0, "0"), datasetsQuery.data?.[0]?.id ?? "-"],
            ["Версии моделей", formatNumber(counts?.models ?? 0, "0"), modelsQuery.data?.[0]?.status ?? "-"],
            ["Запуски прогноза", formatNumber(counts?.forecasts ?? 0, "0"), formatDateTime(forecastsQuery.data?.[0]?.created_at)],
            ["Запуски эксперимента", formatNumber(counts?.experiments ?? 0, "0"), experimentsQuery.data?.[0]?.status ?? "-"],
            ["Серии экспериментов", formatNumber(counts?.series ?? 0, "0"), seriesQuery.data?.[0]?.name ?? "-"],
          ]}
        />
      </Panel>
    </div>
  );
}
