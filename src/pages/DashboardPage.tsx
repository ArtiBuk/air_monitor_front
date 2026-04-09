import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, api, getApiErrorMessage } from "../lib/api";
import {
  formatDateTime,
  formatIsoDateTime,
  formatMetricName,
  formatNumber,
  formatSourceList,
  getMetricSeverity,
  getMetricSeverityLabel,
  getMetricSeverityRank,
} from "../lib/format";
import { ActiveModelOverview, EmptyState, FormMessage, MetricCard, PageHeader, Panel, SeverityBadge, SmallMeta, StatusBadge, Table } from "../components/ui";
import { ForecastChart } from "../components/ForecastChart";

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
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [reportError, setReportError] = useState("");
  const overviewQuery = useQuery({ queryKey: ["overview", "stats"], queryFn: () => api.getMonitoringOverview() });
  const observationsQuery = useQuery({ queryKey: ["overview", "observations"], queryFn: () => api.listObservations({ limit: 8 }) });
  const datasetsQuery = useQuery({ queryKey: ["overview", "datasets"], queryFn: () => api.listDatasets(6) });
  const modelsQuery = useQuery({ queryKey: ["overview", "models"], queryFn: () => api.listModels(6) });
  const forecastsQuery = useQuery({ queryKey: ["overview", "forecasts"], queryFn: () => api.listForecasts(6) });
  const experimentsQuery = useQuery({ queryKey: ["overview", "experiments"], queryFn: () => api.listExperimentRuns({ limit: 6 }) });
  const seriesQuery = useQuery({ queryKey: ["overview", "series"], queryFn: () => api.listExperimentSeries(6) });
  const activeModelQuery = useQuery({ queryKey: ["overview", "active-model"], queryFn: () => queryOrNull(() => api.getActiveModel()) });
  const activeDatasetId = activeModelQuery.data?.dataset ?? null;
  const activeDatasetQuery = useQuery({
    queryKey: ["overview", "active-model", "dataset", activeDatasetId],
    queryFn: () => api.getDataset(activeDatasetId as string),
    enabled: Boolean(activeDatasetId),
  });
  const latestForecastQuery = useQuery({ queryKey: ["overview", "latest-forecast"], queryFn: () => queryOrNull(() => api.getLatestForecast()) });
  const leaderboardQuery = useQuery({ queryKey: ["overview", "leaderboard"], queryFn: () => api.getModelLeaderboard("overall_rmse", 4) });

  const latestForecast = latestForecastQuery.data;
  const leaderboard = leaderboardQuery.data ?? [];
  const activeLeaderboardEntry = leaderboard.find((item) => item.model_version_id === activeModelQuery.data?.id) ?? null;
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

  async function handleDownloadReport() {
    setIsDownloadingReport(true);
    setReportError("");
    try {
      const file = await api.downloadMonitoringExecutiveReport();
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename ?? "air-monitor-report.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setReportError(getApiErrorMessage(error, "Не удалось скачать итоговый отчёт."));
    } finally {
      setIsDownloadingReport(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Обзор лаборатории"
        title="Панель исследования качества воздуха"
        description="Главный экран по состоянию пайплайна: наблюдения, датасеты, модели, прогнозы и серии экспериментов в одном месте."
        actions={
          <button type="button" className="ghost-button" onClick={() => void handleDownloadReport()} disabled={isDownloadingReport}>
            {isDownloadingReport ? "Готовим PDF..." : "Скачать итоговый отчёт"}
          </button>
        }
      />

      {reportError ? <FormMessage tone="error">{reportError}</FormMessage> : null}

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
          <ActiveModelOverview
            model={activeModelQuery.data}
            dataset={activeDatasetQuery.data}
            leaderboardEntry={activeLeaderboardEntry}
          />
        ) : (
          <EmptyState title="Активная модель отсутствует" description="После первого успешного обучения backend автоматически выставит готовую модель активной." />
        )}
      </Panel>

      <Panel
        title="Автосбор наблюдений"
        subtitle="Hourly-задача Celery теперь показывает реальное окно, из которого она каждый раз забирает данные."
      >
        <div className="collection-hero">
          <div className="collection-hero-copy">
            <div className="inline-summary">
              <span className="eyebrow">Celery beat</span>
              <span className="pill">{`каждый час в :${String(collectionConfig?.schedule_minute ?? 5).padStart(2, "0")}`}</span>
            </div>
            <strong>Наблюдения обновляются по скользящему окну, без ручного рестарта пайплайна.</strong>
            <p>
              Каждая hourly-задача заново забирает последние {collectionConfig?.lookback_hours ?? 48} часов, агрегирует данные
              до {collectionConfig?.interval ?? "Interval1H"} и обновляет витрину наблюдений.
            </p>
          </div>

          <div className="collection-stat-grid">
            <div className="collection-stat-card">
              <span>Lookback</span>
              <strong>{collectionConfig?.lookback_hours ?? 48} ч</strong>
            </div>
            <div className="collection-stat-card">
              <span>Окно агрегации</span>
              <strong>{collectionConfig?.window_hours ?? 1} ч</strong>
            </div>
            <div className="collection-stat-card">
              <span>Источники</span>
              <strong>{collectionConfig?.enabled_sources?.length ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="collection-flow">
          <div className="collection-step">
            <span>01</span>
            <strong>Забор данных</strong>
            <p>Окно от текущего момента назад на {collectionConfig?.lookback_hours ?? 48} часов.</p>
          </div>
          <div className="collection-step">
            <span>02</span>
            <strong>Нормализация</strong>
            <p>Приведение к {collectionConfig?.interval ?? "Interval1H"} и окну {collectionConfig?.window_hours ?? 1}ч.</p>
          </div>
          <div className="collection-step">
            <span>03</span>
            <strong>Обновление БД</strong>
            <p>Пишутся актуальные наблюдения для витрин, датасетов и последующих прогнозов.</p>
          </div>
        </div>

        <div className="collection-source-row">
          <span className="panel-note">Источники:</span>
          <strong>{formatSourceList(collectionConfig?.enabled_sources)}</strong>
        </div>
      </Panel>

      <Panel title="Лидерборд моделей" subtitle="Топ-4 готовых моделей с учётом ошибок и объёма датасета.">
        {leaderboard.length ? (
          <Table
            columns={["#", "Модель", "Источник", "Сэмплы", "RMSE", "MAE", "MAPE", "Статус"]}
            rows={leaderboard.map((item) => [
              `#${item.rank}`,
              item.model_name,
              item.metric_source === "backtest" ? "Backtest" : "Training",
              formatNumber(item.dataset_sample_count, "0"),
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
