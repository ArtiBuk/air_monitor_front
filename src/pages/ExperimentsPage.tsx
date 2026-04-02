import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionHint, EmptyState, FieldHint, FormMessage, OperationResult, PageHeader, Panel, ScheduleField, StatusBadge, Table } from "../components/ui";
import { useTaskTracker } from "../hooks/useTaskTracker";
import { api, getApiErrorMessage } from "../lib/api";
import { asObject, formatDateTime, formatNumber, getNestedMetric, humanizeOperation, parseCsvList, fromDateTimeLocalValue, toDateTimeLocalValue } from "../lib/format";

export function ExperimentsPage() {
  const queryClient = useQueryClient();
  const { addTask } = useTaskTracker();
  const [seriesFeedback, setSeriesFeedback] = useState<{
    title: string;
    status?: string | null;
    items: Array<{ label: string; value: string }>;
    raw?: unknown;
  } | null>(null);
  const [runFeedback, setRunFeedback] = useState<{
    title: string;
    status?: string | null;
    items: Array<{ label: string; value: string }>;
    raw?: unknown;
  } | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [didAutofillConfig, setDidAutofillConfig] = useState(false);
  const [seriesForm, setSeriesForm] = useState({
    name: "",
    description: "",
    goal: "baseline comparison",
  });
  const [runForm, setRunForm] = useState({
    name: "baseline-exp",
    series_id: "",
    input_len_hours: 72,
    forecast_horizon_hours: 24,
    feature_columns: "",
    target_columns: "",
    epochs: 24,
    batch_size: 16,
    lr: 0.001,
    weight_decay: 0.0001,
    patience: 8,
    seed: 42,
    generated_from_timestamp_utc: "",
    scheduled_for: "",
  });

  const seriesQuery = useQuery({ queryKey: ["experiment-series"], queryFn: () => api.listExperimentSeries(12) });
  const datasetsQuery = useQuery({ queryKey: ["experiment-datasets"], queryFn: () => api.listDatasets(12) });
  const runsQuery = useQuery({ queryKey: ["experiment-runs"], queryFn: () => api.listExperimentRuns({ limit: 12 }) });
  const reportQuery = useQuery({
    queryKey: ["experiment-series-report", selectedSeriesId],
    queryFn: () => api.getExperimentSeriesReport(selectedSeriesId),
    enabled: Boolean(selectedSeriesId),
  });

  useEffect(() => {
    if (!selectedSeriesId && seriesQuery.data?.length) {
      setSelectedSeriesId(seriesQuery.data[0].id);
      setRunForm((current) => ({ ...current, series_id: seriesQuery.data[0].id }));
    }
  }, [selectedSeriesId, seriesQuery.data]);

  useEffect(() => {
    const latest = datasetsQuery.data?.[0];
    if (!latest || didAutofillConfig) {
      return;
    }

    setRunForm((current) => ({
      ...current,
      input_len_hours: latest.input_len_hours,
      forecast_horizon_hours: latest.forecast_horizon_hours,
      feature_columns: latest.feature_columns.join(", "),
      target_columns: latest.target_columns.join(", "),
    }));
    setDidAutofillConfig(true);
  }, [datasetsQuery.data, didAutofillConfig]);

  function buildRunPayload() {
    const cutoff = fromDateTimeLocalValue(runForm.generated_from_timestamp_utc);

    return {
      name: runForm.name,
      series_id: runForm.series_id || null,
      dataset: {
        input_len_hours: Number(runForm.input_len_hours),
        forecast_horizon_hours: Number(runForm.forecast_horizon_hours),
        feature_columns: parseCsvList(runForm.feature_columns),
        target_columns: parseCsvList(runForm.target_columns),
      },
      training: {
        epochs: Number(runForm.epochs),
        batch_size: Number(runForm.batch_size),
        lr: Number(runForm.lr),
        weight_decay: Number(runForm.weight_decay),
        patience: Number(runForm.patience),
        seed: Number(runForm.seed),
      },
      backtest: cutoff ? { generated_from_timestamp_utc: cutoff } : null,
      scheduled_for: fromDateTimeLocalValue(runForm.scheduled_for),
    };
  }

  const createSeriesMutation = useMutation({
    mutationFn: api.createExperimentSeries,
    onSuccess: async (result) => {
      setFormMessage("");
      setSeriesFeedback({
        title: "Серия создана",
        status: result.status,
        items: [
          { label: "Серия", value: result.name },
          { label: "ID", value: result.id.slice(0, 8) },
          { label: "Статус", value: result.status },
          { label: "Создана", value: formatDateTime(result.created_at) },
        ],
        raw: result,
      });
      setSelectedSeriesId(result.id);
      setRunForm((current) => ({ ...current, series_id: result.id }));
      await queryClient.invalidateQueries({ queryKey: ["experiment-series"] });
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось создать experiment series."));
    },
  });

  const runExperimentMutation = useMutation({
    mutationFn: api.runExperiment,
    onSuccess: async (result) => {
      setFormMessage("");
      setRunFeedback({
        title: "Эксперимент выполнен",
        status: result.status,
        items: [
          { label: "Запуск", value: result.name },
          { label: "Серия", value: result.series?.slice(0, 8) ?? "-" },
          { label: "Прогноз", value: result.forecast_run?.slice(0, 8) ?? "-" },
          { label: "Оценка", value: result.forecast_evaluation?.slice(0, 8) ?? "-" },
        ],
        raw: result,
      });
      await queryClient.invalidateQueries({ queryKey: ["experiment-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["experiment-series"] });
      if (result.series) {
        await queryClient.invalidateQueries({ queryKey: ["experiment-series-report", result.series] });
      }
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось запустить эксперимент."));
    },
  });

  const runExperimentAsyncMutation = useMutation({
    mutationFn: api.runExperimentAsync,
    onSuccess: (result) => {
      setFormMessage("");
      addTask({
        taskId: result.task_id,
        operation: result.operation,
        createdAt: new Date().toISOString(),
        note: result.is_scheduled ? "Отложенный запуск эксперимента" : "Фоновый запуск эксперимента",
        scheduledTaskId: result.scheduled_task_id,
        scheduledFor: result.scheduled_for,
        isScheduled: result.is_scheduled,
      });
      setRunFeedback({
        title: result.is_scheduled ? "Эксперимент запланирован" : "Эксперимент поставлен в очередь",
        status: result.status,
        items: [
          { label: "Операция", value: humanizeOperation(result.operation) },
          { label: "ID задачи", value: result.task_id.slice(0, 8) },
          { label: "ID плановой задачи", value: result.scheduled_task_id?.slice(0, 8) ?? "-" },
          { label: "Запуск", value: result.scheduled_for ? formatDateTime(result.scheduled_for) : "сразу" },
        ],
        raw: result,
      });
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось поставить эксперимент в очередь."));
    },
  });

  const reportAggregates = reportQuery.data?.aggregates;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Исследование"
        title="Эксперименты и серии"
        description="Экран для исследовательских прогонов: отдельные запуски экспериментов, серии и сводные отчёты."
      />

      <div className="dashboard-grid">
        <Panel title="Создать series" subtitle="Серия нужна, чтобы группировать эксперименты по исследовательской гипотезе.">
          <div className="form-grid">
            <label>
              <span>Название</span>
              <input value={seriesForm.name} onChange={(event) => setSeriesForm({ ...seriesForm, name: event.target.value })} />
              <FieldHint>Короткое имя серии. Например: baseline-v1 или weather-plus-emissions.</FieldHint>
            </label>
            <label>
              <span>Цель</span>
              <input value={seriesForm.goal} onChange={(event) => setSeriesForm({ ...seriesForm, goal: event.target.value })} />
              <FieldHint>Одной фразой опиши, что именно сравниваешь или проверяешь.</FieldHint>
            </label>
            <label className="full-span">
              <span>Описание</span>
              <textarea
                rows={3}
                value={seriesForm.description}
                onChange={(event) => setSeriesForm({ ...seriesForm, description: event.target.value })}
              />
              <FieldHint>Подробное описание гипотезы, состава признаков или причин, почему запускаешь эту серию.</FieldHint>
            </label>
          </div>
          {formMessage ? <FormMessage tone="error">{formMessage}</FormMessage> : null}
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                createSeriesMutation.mutate({
                  name: seriesForm.name,
                  description: seriesForm.description,
                  configuration: {
                    goal: seriesForm.goal,
                    dataset: {
                      input_len_hours: Number(runForm.input_len_hours),
                      forecast_horizon_hours: Number(runForm.forecast_horizon_hours),
                      feature_columns: parseCsvList(runForm.feature_columns),
                      target_columns: parseCsvList(runForm.target_columns),
                    },
                  },
                })
              }
            >
              Создать серию
            </button>
          </div>
          {seriesFeedback ? (
            <OperationResult title={seriesFeedback.title} status={seriesFeedback.status} items={seriesFeedback.items} raw={seriesFeedback.raw} />
          ) : null}
        </Panel>

        <Panel title="Запуск эксперимента" subtitle="Полный исследовательский прогон: датасет, обучение, прогноз и при необходимости ретропроверка в одном сценарии.">
          <div className="form-grid">
            <label>
              <span>Название эксперимента</span>
              <input value={runForm.name} onChange={(event) => setRunForm({ ...runForm, name: event.target.value })} />
              <FieldHint>Имя конкретного запуска внутри серии. Лучше делать осмысленным, чтобы потом сравнивать результаты.</FieldHint>
            </label>
            <label>
              <span>Серия</span>
              <select value={runForm.series_id} onChange={(event) => setRunForm({ ...runForm, series_id: event.target.value })}>
                <option value="">Без серии</option>
                {(seriesQuery.data ?? []).map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.name}
                  </option>
                ))}
              </select>
              <FieldHint>Если выбрать серию, результаты попадут в общий отчёт по этой исследовательской группе.</FieldHint>
            </label>
            <label>
              <span>Входное окно, ч</span>
              <input type="number" value={runForm.input_len_hours} onChange={(event) => setRunForm({ ...runForm, input_len_hours: Number(event.target.value) })} />
              <FieldHint>Окно входных данных для датасета и прогноза. Если есть прошлый срез, значения подставятся автоматически.</FieldHint>
            </label>
            <label>
              <span>Горизонт прогноза, ч</span>
              <input
                type="number"
                value={runForm.forecast_horizon_hours}
                onChange={(event) => setRunForm({ ...runForm, forecast_horizon_hours: Number(event.target.value) })}
              />
              <FieldHint>Горизонт прогноза внутри одного запуска эксперимента. Берётся из последнего среза, если он найден.</FieldHint>
            </label>
            <label>
              <span>Эпохи</span>
              <input type="number" value={runForm.epochs} onChange={(event) => setRunForm({ ...runForm, epochs: Number(event.target.value) })} />
              <FieldHint>Количество эпох обучения в этом эксперименте. Для быстрого прогона ставь маленькое значение.</FieldHint>
            </label>
            <label>
              <span>Размер батча</span>
              <input
                type="number"
                value={runForm.batch_size}
                onChange={(event) => setRunForm({ ...runForm, batch_size: Number(event.target.value) })}
              />
              <FieldHint>Размер батча для шага train. Обычно `8` или `16` достаточно.</FieldHint>
            </label>
            <label>
              <span>Случайное зерно</span>
              <input type="number" value={runForm.seed} onChange={(event) => setRunForm({ ...runForm, seed: Number(event.target.value) })} />
              <FieldHint>Фиксирует воспроизводимость сравнения между запусками.</FieldHint>
            </label>
            <label className="full-span">
              <span>Признаки</span>
              <textarea
                rows={2}
                value={runForm.feature_columns}
                onChange={(event) => setRunForm({ ...runForm, feature_columns: event.target.value })}
                placeholder="metric_a, metric_b, metric_c"
              />
              <FieldHint>Если в системе уже есть срез датасета, сюда подставится его список признаков. Можно отредактировать вручную.</FieldHint>
            </label>
            <label className="full-span">
              <span>Целевые метрики</span>
              <textarea
                rows={2}
                value={runForm.target_columns}
                onChange={(event) => setRunForm({ ...runForm, target_columns: event.target.value })}
                placeholder="target_a, target_b"
              />
              <FieldHint>Если найден прошлый срез, целевые метрики также подставятся автоматически.</FieldHint>
            </label>
            <label className="full-span">
              <span>Дата отсечения для backtest</span>
              <input
                type="datetime-local"
                value={runForm.generated_from_timestamp_utc}
                onChange={(event) => setRunForm({ ...runForm, generated_from_timestamp_utc: event.target.value })}
                placeholder={toDateTimeLocalValue(new Date())}
              />
              <FieldHint>Необязательное поле. Если заполнить, запуск эксперимента дополнительно выполнит историческую ретропроверку от этой точки.</FieldHint>
            </label>
            <ScheduleField
              value={runForm.scheduled_for}
              onChange={(event) => setRunForm({ ...runForm, scheduled_for: event.target.value })}
            />
          </div>
          <ActionHint>Если в системе уже есть срез датасета, форма возьмёт его конфигурацию как стартовую. Для обычной проверки достаточно одного быстрого запуска, для сравнений лучше сначала создать серию.</ActionHint>
          {formMessage ? <FormMessage tone="error">{formMessage}</FormMessage> : null}
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => runExperimentMutation.mutate(buildRunPayload())}>
              Запустить сразу
            </button>
            <button type="button" className="secondary-button" onClick={() => runExperimentAsyncMutation.mutate(buildRunPayload())}>
              Запустить в фоне
            </button>
          </div>
          {runFeedback ? <OperationResult title={runFeedback.title} status={runFeedback.status} items={runFeedback.items} raw={runFeedback.raw} /> : null}
        </Panel>
      </div>

      <div className="dashboard-grid">
        <Panel title="Запуски экспериментов" subtitle="Последние исследовательские прогоны со сводкой результата.">
          <Table
            columns={["Запуск", "Серия", "Статус", "RMSE обучения", "RMSE ретропроверки", "Создан"]}
            rows={(runsQuery.data ?? []).map((run) => {
              const summary = asObject(run.summary);
              const modelSummary = asObject(summary.model_version);
              const evaluationSummary = asObject(summary.forecast_evaluation);
              return [
                run.name,
                run.series?.slice(0, 8) ?? "-",
                <StatusBadge status={run.status} />,
                formatNumber(getNestedMetric(modelSummary, "overall_rmse")),
                formatNumber(getNestedMetric(evaluationSummary, "overall_rmse")),
                formatDateTime(run.created_at),
              ];
            })}
          />
        </Panel>

        <Panel title="Отчёт по серии" subtitle="Агрегаты по выбранной серии экспериментов.">
          {reportQuery.data && reportAggregates ? (
            <div className="detail-stack">
              <div className="inline-summary">
                <StatusBadge status={reportQuery.data.series.status} />
                <span className="pill">{reportQuery.data.series.name}</span>
              </div>
              <div className="detail-grid">
                <div className="mini-card">
                  <span>Запусков</span>
                  <strong>{reportAggregates.run_count}</strong>
                </div>
                <div className="mini-card">
                  <span>Завершено</span>
                  <strong>{reportAggregates.completed_run_count}</strong>
                </div>
                <div className="mini-card">
                  <span>Средняя RMSE обучения</span>
                  <strong>{formatNumber(reportAggregates.avg_training_overall_rmse)}</strong>
                </div>
                <div className="mini-card">
                  <span>Средняя RMSE ретропроверки</span>
                  <strong>{formatNumber(reportAggregates.avg_backtest_overall_rmse)}</strong>
                </div>
              </div>
              <Table
                columns={["Запуск", "Статус", "Оценка прогноза", "Создан"]}
                rows={reportQuery.data.runs.map((run) => [
                  run.name,
                  <StatusBadge status={run.status} />,
                  run.forecast_evaluation?.slice(0, 8) ?? "-",
                  formatDateTime(run.created_at),
                ])}
              />
            </div>
          ) : (
            <EmptyState title="Серия не выбрана" description="Выберите или создайте experiment series, чтобы увидеть агрегированный report." />
          )}
        </Panel>
      </div>
    </div>
  );
}
