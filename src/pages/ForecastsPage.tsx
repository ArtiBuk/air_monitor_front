import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionHint, EmptyState, FieldHint, ForecastChart, FormMessage, OperationResult, PageHeader, Panel, ScheduleField, StatusBadge, Table } from "../components/ui";
import { useTaskTracker } from "../hooks/useTaskTracker";
import { ApiError, api, getApiErrorMessage } from "../lib/api";
import { asObject, formatDateTime, formatNumber, formatPercent, fromDateTimeLocalValue, getNestedMetric, humanizeOperation, toDateTimeLocalValue } from "../lib/format";

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

export function ForecastsPage() {
  const queryClient = useQueryClient();
  const { addTask } = useTaskTracker();
  const [feedback, setFeedback] = useState<{
    title: string;
    status?: string | null;
    items: Array<{ label: string; value: string }>;
    raw?: unknown;
  } | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [selectedForecastId, setSelectedForecastId] = useState("");
  const [form, setForm] = useState({
    model_version_id: "",
    input_len_hours: 72,
    forecast_horizon_hours: 24,
    generated_from_timestamp_utc: "",
    scheduled_for: "",
  });

  const modelsQuery = useQuery({ queryKey: ["forecasts", "models"], queryFn: () => api.listModels(20) });
  const latestObservationQuery = useQuery({
    queryKey: ["forecasts", "latest-observation"],
    queryFn: () => api.listObservations({ limit: 1 }),
  });
  const activeModelQuery = useQuery({ queryKey: ["forecasts", "active-model"], queryFn: () => queryOrNull(() => api.getActiveModel()) });
  const latestForecastQuery = useQuery({ queryKey: ["forecasts", "latest"], queryFn: () => queryOrNull(() => api.getLatestForecast()) });
  const forecastsQuery = useQuery({ queryKey: ["forecasts"], queryFn: () => api.listForecasts(12) });
  const evaluationsQuery = useQuery({ queryKey: ["forecast-evaluations"], queryFn: () => api.listEvaluations({ limit: 12 }) });
  const forecastDetailQuery = useQuery({
    queryKey: ["forecasts", "detail", selectedForecastId],
    queryFn: () => api.getForecast(selectedForecastId),
    enabled: Boolean(selectedForecastId),
  });

  useEffect(() => {
    if (!selectedForecastId && forecastsQuery.data?.length) {
      setSelectedForecastId(forecastsQuery.data[0].id);
    }
  }, [forecastsQuery.data, selectedForecastId]);

  useEffect(() => {
    const activeModel = activeModelQuery.data;
    if (!activeModel) {
      return;
    }

    setForm((current) =>
      current.model_version_id
        ? current
        : {
            ...current,
            model_version_id: activeModel.id,
            input_len_hours: activeModel.input_len_hours || current.input_len_hours,
            forecast_horizon_hours: activeModel.forecast_horizon_hours || current.forecast_horizon_hours,
          },
    );
  }, [activeModelQuery.data]);

  const forecastableModels = (modelsQuery.data ?? []).filter((model) => model.status === "ready");
  const selectedForecast = forecastDetailQuery.data ?? null;
  const selectedForecastLastTimestamp = selectedForecast?.records.at(-1)?.timestamp_utc ?? null;
  const latestObservationTimestamp = latestObservationQuery.data?.[0]?.observed_at_utc ?? null;
  const evaluationHasActuals =
    Boolean(selectedForecastLastTimestamp) &&
    Boolean(latestObservationTimestamp) &&
    new Date(latestObservationTimestamp as string).getTime() >= new Date(selectedForecastLastTimestamp as string).getTime();

  useEffect(() => {
    const generatedFrom = latestForecastQuery.data?.generated_from_timestamp_utc;
    if (!generatedFrom) {
      return;
    }

    setForm((current) =>
      current.generated_from_timestamp_utc
        ? current
        : {
            ...current,
            generated_from_timestamp_utc: toDateTimeLocalValue(new Date(generatedFrom)),
          },
    );
  }, [latestForecastQuery.data]);

  function buildPayload() {
    return {
      model_version_id: form.model_version_id || null,
      input_len_hours: Number(form.input_len_hours),
      forecast_horizon_hours: Number(form.forecast_horizon_hours),
      generated_from_timestamp_utc: fromDateTimeLocalValue(form.generated_from_timestamp_utc),
      scheduled_for: fromDateTimeLocalValue(form.scheduled_for),
    };
  }

  const generateMutation = useMutation({
    mutationFn: api.generateForecast,
    onSuccess: async (result) => {
      setFormMessage("");
      setFeedback({
        title: "Прогноз сгенерирован",
        status: result.status,
        items: [
          { label: "Запуск", value: result.id.slice(0, 8) },
          { label: "Горизонт", value: `${result.forecast_horizon_hours} ч` },
          { label: "Точек", value: String(result.records.length) },
          { label: "Отсечение", value: formatDateTime(result.generated_from_timestamp_utc) },
        ],
        raw: result,
      });
      setSelectedForecastId(result.id);
      await queryClient.invalidateQueries({ queryKey: ["forecasts"] });
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось сгенерировать прогноз."));
    },
  });

  const generateAsyncMutation = useMutation({
    mutationFn: api.generateForecastAsync,
    onSuccess: (result) => {
      setFormMessage("");
      addTask({
        taskId: result.task_id,
        operation: result.operation,
        createdAt: new Date().toISOString(),
        note: result.is_scheduled ? "Отложенная генерация прогноза" : "Фоновая генерация прогноза",
        scheduledTaskId: result.scheduled_task_id,
        scheduledFor: result.scheduled_for,
        isScheduled: result.is_scheduled,
      });
      setFeedback({
        title: result.is_scheduled ? "Генерация прогноза запланирована" : "Генерация прогноза поставлена в очередь",
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
      setFormMessage(getApiErrorMessage(error, "Не удалось поставить генерацию прогноза в очередь."));
    },
  });

  const backtestMutation = useMutation({
    mutationFn: api.backtestForecast,
    onSuccess: async (result) => {
      setFormMessage("");
      setFeedback({
        title: "Backtest завершён",
        status: result.status,
        items: [
          { label: "Запуск", value: result.id.slice(0, 8) },
          { label: "Горизонт", value: `${result.forecast_horizon_hours} ч` },
          { label: "Точек", value: String(result.records.length) },
          { label: "Отсечение", value: formatDateTime(result.generated_from_timestamp_utc) },
        ],
        raw: result,
      });
      setSelectedForecastId(result.id);
      await queryClient.invalidateQueries({ queryKey: ["forecasts"] });
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось выполнить ретропроверку."));
    },
  });

  const evaluateMutation = useMutation({
    mutationFn: api.evaluateForecast,
    onSuccess: async (result) => {
      setFormMessage("");
      const metrics = asObject(result.metrics);
      setFeedback({
        title: "Прогноз оценён по факту",
        status: result.status,
        items: [
          { label: "Покрытие", value: formatPercent(result.coverage_ratio) },
          { label: "Совпадений", value: String(result.matched_record_count) },
          { label: "RMSE", value: formatNumber(getNestedMetric(metrics, "summary", "overall_rmse")) },
          { label: "MAE", value: formatNumber(getNestedMetric(metrics, "summary", "overall_mae")) },
        ],
        raw: result,
      });
      await queryClient.invalidateQueries({ queryKey: ["forecast-evaluations"] });
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось оценить прогноз по факту."));
    },
  });

  const selectedEvaluation = (evaluationsQuery.data ?? []).find((item) => item.forecast_run === selectedForecastId);
  const evaluationMetrics = asObject(selectedEvaluation?.metrics);
  const isCompletedEvaluation = selectedEvaluation?.status === "completed";
  const isFailedEvaluation = selectedEvaluation?.status === "failed";

  function handleBacktest() {
    if (!form.generated_from_timestamp_utc) {
      setFormMessage("Для backtest обязательно заполни поле даты отсечения. Backend строит исторический прогноз именно от этого момента.");
      return;
    }

    backtestMutation.mutate(buildPayload());
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Прогнозирование"
        title="Прогнозы, ретропроверка и оценка"
        description="Экран для построения прогноза, запуска исторической ретропроверки и оценки прогноза по фактическим наблюдениям."
      />

      <div className="dashboard-grid">
        <Panel title="Построение прогноза и ретропроверка" subtitle="Обычный прогноз строится от текущего момента, а ретропроверка требует фиксированную дату отсечения.">
          <div className="form-grid">
            <label className="full-span">
              <span>Версия модели</span>
              <select value={form.model_version_id} onChange={(event) => setForm({ ...form, model_version_id: event.target.value })}>
                <option value="">Активная / по умолчанию</option>
                {forecastableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} · {model.status} · {model.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <FieldHint>Если backend уже знает активную модель, она подставится автоматически. В списке показываются только модели со статусом `ready`, потому что `training` и `failed` версии нельзя использовать для прогноза.</FieldHint>
            </label>
            <label>
              <span>Входное окно, ч</span>
              <input
                type="number"
                value={form.input_len_hours}
                onChange={(event) => setForm({ ...form, input_len_hours: Number(event.target.value) })}
              />
              <FieldHint>Сколько часов истории подать в модель перед расчётом прогноза. Обычно подтягивается из активной модели.</FieldHint>
            </label>
            <label>
              <span>Горизонт прогноза, ч</span>
              <input
                type="number"
                value={form.forecast_horizon_hours}
                onChange={(event) => setForm({ ...form, forecast_horizon_hours: Number(event.target.value) })}
              />
              <FieldHint>Длина прогноза вперёд. Если есть активная модель, горизонт подставляется из неё автоматически.</FieldHint>
            </label>
            <label className="full-span">
              <span>Дата отсечения для backtest</span>
              <input
                type="datetime-local"
                value={form.generated_from_timestamp_utc}
                onChange={(event) => setForm({ ...form, generated_from_timestamp_utc: event.target.value })}
                placeholder={toDateTimeLocalValue(new Date())}
              />
              <FieldHint>Нужно только для ретропроверки. Если в системе уже есть прошлый прогноз, его точка отсечения подставится автоматически как стартовый вариант.</FieldHint>
            </label>
            <ScheduleField
              value={form.scheduled_for}
              onChange={(event) => setForm({ ...form, scheduled_for: event.target.value })}
              hint="Работает только для фоновой генерации. Ретропроверка выполняется сразу и не ставится на расписание."
            />
          </div>
          <ActionHint>Обычная генерация строит прогноз от текущего момента. Ретропроверка нужна для проверки модели на прошлом периоде и всегда требует дату отсечения.</ActionHint>
          {formMessage ? <FormMessage tone="error">{formMessage}</FormMessage> : null}
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => generateMutation.mutate(buildPayload())}>
              Построить сразу
            </button>
            <button type="button" className="secondary-button" onClick={() => generateAsyncMutation.mutate(buildPayload())}>
              Запустить в фоне
            </button>
            <button type="button" className="ghost-button" onClick={handleBacktest}>
              Запустить ретропроверку
            </button>
          </div>
          {feedback ? <OperationResult title={feedback.title} status={feedback.status} items={feedback.items} raw={feedback.raw} /> : null}
        </Panel>

        <Panel title="Выбранный прогноз" subtitle="Графики и текущая сводка качества по выбранному запуску прогноза.">
          {forecastDetailQuery.data ? (
            <div className="detail-stack">
              <div className="inline-summary">
                <StatusBadge status={forecastDetailQuery.data.status} />
                <span className="pill">{forecastDetailQuery.data.id.slice(0, 8)}</span>
              </div>
              <ForecastChart records={forecastDetailQuery.data.records} />
              {isCompletedEvaluation ? (
                <div className="detail-grid">
                  <div className="mini-card">
                    <span>Покрытие</span>
                    <strong>{formatPercent(selectedEvaluation.coverage_ratio)}</strong>
                  </div>
                  <div className="mini-card">
                    <span>RMSE</span>
                    <strong>{formatNumber(getNestedMetric(evaluationMetrics, "summary", "overall_rmse"))}</strong>
                  </div>
                  <div className="mini-card">
                    <span>MAE</span>
                    <strong>{formatNumber(getNestedMetric(evaluationMetrics, "summary", "overall_mae"))}</strong>
                  </div>
                </div>
              ) : (
                <>
                  {isFailedEvaluation ? (
                    <FormMessage tone="error">
                      {selectedEvaluation?.error_message || "Прошлая попытка оценки завершилась ошибкой."}
                    </FormMessage>
                  ) : null}
                  {!evaluationHasActuals ? (
                    <FieldHint>
                      Оценка по факту станет доступна, когда наблюдения дойдут хотя бы до{" "}
                      {selectedForecastLastTimestamp ? formatDateTime(selectedForecastLastTimestamp) : "конца горизонта прогноза"}.
                      {" "}Сейчас последнее доступное наблюдение:{" "}
                      {latestObservationTimestamp ? formatDateTime(latestObservationTimestamp) : "ещё не загружено"}.
                    </FieldHint>
                  ) : null}
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => evaluateMutation.mutate(selectedForecastId)}
                    disabled={!evaluationHasActuals}
                  >
                    {isFailedEvaluation ? "Повторить оценку по факту" : "Оценить по факту"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <EmptyState title="Выберите запуск прогноза" description="После генерации прогноза его детали и график появятся в этом блоке." />
          )}
        </Panel>
      </div>

      <div className="dashboard-grid">
        <Panel title="Запуски прогноза" subtitle="Список последних запусков прогноза. Клик по строке раскрывает детали справа.">
          <Table
            columns={["ID", "Статус", "Модель", "Отсечение", "Создан", "Горизонт"]}
            rows={(forecastsQuery.data ?? []).map((run) => [
              <button type="button" className="table-button" onClick={() => setSelectedForecastId(run.id)}>
                {run.id.slice(0, 8)}
              </button>,
              <StatusBadge status={run.status} />,
              run.model_version?.slice(0, 8) ?? "-",
              formatDateTime(run.generated_from_timestamp_utc),
              formatDateTime(run.created_at),
              String(run.forecast_horizon_hours),
            ])}
          />
        </Panel>

        <Panel title="Оценка прогнозов" subtitle="Оценки качества прогнозов по фактическим наблюдениям.">
          <Table
            columns={["Прогноз", "Статус", "Покрытие", "RMSE", "MAE", "Оценён"]}
            rows={(evaluationsQuery.data ?? []).map((evaluation) => {
              const metrics = asObject(evaluation.metrics);
              return [
                evaluation.forecast_run.slice(0, 8),
                <StatusBadge status={evaluation.status} />,
                formatPercent(evaluation.coverage_ratio),
                formatNumber(getNestedMetric(metrics, "summary", "overall_rmse")),
                formatNumber(getNestedMetric(metrics, "summary", "overall_mae")),
                formatDateTime(evaluation.evaluated_at_utc),
              ];
            })}
          />
        </Panel>
      </div>
    </div>
  );
}
