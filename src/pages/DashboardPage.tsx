import { useQuery } from "@tanstack/react-query";

import { ApiError, api } from "../lib/api";
import { asObject, formatNumber, getNestedMetric, joinList } from "../lib/format";
import { EmptyState, ForecastChart, KeyMetricRow, MetricCard, PageHeader, Panel, SmallMeta, StatusBadge, Table } from "../components/ui";

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

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Обзор лаборатории"
        title="Панель исследования качества воздуха"
        description="Главный экран по состоянию пайплайна: наблюдения, датасеты, модели, прогнозы и серии экспериментов в одном месте."
      />

      <section className="metrics-grid">
        <MetricCard label="Наблюдения" value={String(observationsQuery.data?.length ?? 0)} helper="последние записи по API" tone="accent" />
        <MetricCard label="Датасеты" value={String(datasetsQuery.data?.length ?? 0)} helper="доступные срезы" />
        <MetricCard label="Модели" value={String(modelsQuery.data?.length ?? 0)} helper="версии модели" />
        <MetricCard label="Прогнозы" value={String(forecastsQuery.data?.length ?? 0)} helper="запуски прогноза" tone="warm" />
        <MetricCard label="Эксперименты" value={String(experimentsQuery.data?.length ?? 0)} helper="запуски исследования" />
        <MetricCard label="Серии" value={String(seriesQuery.data?.length ?? 0)} helper="исследовательские кампании" />
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
              <p className="panel-note">Цели: {joinList(activeModelQuery.data.target_names)}</p>
            </div>
          ) : (
            <EmptyState title="Активная модель отсутствует" description="После первого успешного обучения backend автоматически выставит готовую модель активной." />
          )}
        </Panel>
      </div>

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
            ["Наблюдения", String(observationsQuery.data?.length ?? 0), observationsQuery.data?.[0]?.metric ?? "-"],
            ["Срезы датасета", String(datasetsQuery.data?.length ?? 0), datasetsQuery.data?.[0]?.id ?? "-"],
            ["Версии моделей", String(modelsQuery.data?.length ?? 0), modelsQuery.data?.[0]?.status ?? "-"],
            ["Запуски прогноза", String(forecastsQuery.data?.length ?? 0), forecastsQuery.data?.[0]?.status ?? "-"],
            ["Запуски эксперимента", String(experimentsQuery.data?.length ?? 0), experimentsQuery.data?.[0]?.status ?? "-"],
            ["Серии экспериментов", String(seriesQuery.data?.length ?? 0), seriesQuery.data?.[0]?.name ?? "-"],
          ]}
        />
      </Panel>
    </div>
  );
}
