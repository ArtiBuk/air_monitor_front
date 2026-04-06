import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionHint, FieldHint, FormMessage, OperationResult, PageHeader, Panel, ScheduleField, Table } from "../components/ui";
import { useTaskTracker } from "../hooks/useTaskTracker";
import { api, getApiErrorMessage } from "../lib/api";
import { formatDateTime, fromDateTimeLocalValue, humanizeOperation, parseCsvList } from "../lib/format";

type ResultState = {
  title: string;
  status?: string | null;
  items: Array<{ label: string; value: string }>;
  raw?: unknown;
};

export function DatasetsPage() {
  const queryClient = useQueryClient();
  const { addTask } = useTaskTracker();
  const [feedback, setFeedback] = useState<ResultState | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [didAutofill, setDidAutofill] = useState(false);
  const [form, setForm] = useState({
    input_len_hours: 72,
    forecast_horizon_hours: 24,
    feature_columns: "",
    target_columns: "",
    scheduled_for: "",
  });

  const datasetsQuery = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api.listDatasets(12),
  });

  useEffect(() => {
    const latest = datasetsQuery.data?.[0];
    if (!latest || didAutofill) {
      return;
    }

    setForm((current) => ({
      ...current,
      input_len_hours: latest.input_len_hours,
      forecast_horizon_hours: latest.forecast_horizon_hours,
      feature_columns: latest.feature_columns.join(", "),
      target_columns: latest.target_columns.join(", "),
    }));
    setDidAutofill(true);
  }, [datasetsQuery.data, didAutofill]);

  function buildPayload() {
    return {
      input_len_hours: Number(form.input_len_hours),
      forecast_horizon_hours: Number(form.forecast_horizon_hours),
      feature_columns: parseCsvList(form.feature_columns),
      target_columns: parseCsvList(form.target_columns),
      scheduled_for: fromDateTimeLocalValue(form.scheduled_for),
    };
  }

  const syncMutation = useMutation({
    mutationFn: api.buildDataset,
    onSuccess: async (result) => {
      setFormMessage("");
      setFeedback({
        title: "Срез датасета собран",
        status: "success",
        items: [
          { label: "Срез", value: result.id.slice(0, 8) },
          { label: "Примеров", value: String(result.sample_count) },
          { label: "Признаков", value: String(result.feature_columns.length) },
          { label: "Целевых метрик", value: String(result.target_columns.length) },
        ],
        raw: result,
      });
      await queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось собрать срез датасета."));
    },
  });

  const asyncMutation = useMutation({
    mutationFn: api.buildDatasetAsync,
    onSuccess: (result) => {
      setFormMessage("");
      addTask({
        taskId: result.task_id,
        operation: result.operation,
        createdAt: new Date().toISOString(),
        note: result.is_scheduled ? "Отложенная сборка датасета" : "Фоновая сборка датасета",
        scheduledTaskId: result.scheduled_task_id,
        scheduledFor: result.scheduled_for,
        isScheduled: result.is_scheduled,
      });
      setFeedback({
        title: result.is_scheduled ? "Сборка датасета запланирована" : "Сборка датасета поставлена в очередь",
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
      setFormMessage(getApiErrorMessage(error, "Не удалось поставить сборку датасета в очередь."));
    },
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Подготовка данных"
        title="Срезы датасетов"
        description="Создание и просмотр срезов датасета, которые фиксируют входное окно, горизонт прогноза и набор признаков для дальнейшего обучения."
      />

      <Panel title="Сборка среза" subtitle="Если признаки или целевые метрики не указаны, backend возьмет значения по умолчанию.">
        <div className="form-grid">
          <label>
            <span>Входное окно, ч</span>
            <input
              type="number"
              min={1}
              value={form.input_len_hours}
              onChange={(event) => setForm({ ...form, input_len_hours: Number(event.target.value) })}
            />
            <FieldHint>Сколько часов истории подаётся в модель как вход. Если в системе уже есть прошлый срез, это поле подставится автоматически.</FieldHint>
          </label>
          <label>
            <span>Горизонт прогноза, ч</span>
            <input
              type="number"
              min={1}
              value={form.forecast_horizon_hours}
              onChange={(event) => setForm({ ...form, forecast_horizon_hours: Number(event.target.value) })}
            />
            <FieldHint>На сколько часов вперёд строится прогноз. Если есть прошлый срез, горизонт тоже подтянется автоматически.</FieldHint>
          </label>
          <label className="full-span">
            <span>Признаки</span>
            <textarea
              rows={3}
              value={form.feature_columns}
              onChange={(event) => setForm({ ...form, feature_columns: event.target.value })}
              placeholder="plume_pm25, plume_so2, plume_no2, ..."
            />
            <FieldHint>Список признаков через запятую в backend-id формате. Например: `plume_pm25`, `plume_so2`, `hour_sin`.</FieldHint>
          </label>
          <label className="full-span">
            <span>Целевые метрики</span>
            <textarea
              rows={2}
              value={form.target_columns}
              onChange={(event) => setForm({ ...form, target_columns: event.target.value })}
              placeholder="mycityair_aqi_mean, plume_pm25, plume_so2"
            />
            <FieldHint>Что именно модель должна предсказывать. Здесь можно явно оставить `mycityair_aqi_mean`, чтобы модель отдавала прогнозный AQI.</FieldHint>
          </label>
          <ScheduleField
            value={form.scheduled_for}
            onChange={(event) => setForm({ ...form, scheduled_for: event.target.value })}
          />
        </div>
        <ActionHint>Эта форма сначала пытается взять параметры последнего среза, чтобы не вводить их заново. Если число примеров в результате равно нулю, значит под выбранные окна пока не хватает наблюдений.</ActionHint>
        {formMessage ? <FormMessage tone="error">{formMessage}</FormMessage> : null}
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => syncMutation.mutate(buildPayload())}>
            Собрать синхронно
          </button>
          <button type="button" className="secondary-button" onClick={() => asyncMutation.mutate(buildPayload())}>
            Собрать асинхронно
          </button>
        </div>
        {feedback ? <OperationResult title={feedback.title} status={feedback.status} items={feedback.items} raw={feedback.raw} /> : null}
      </Panel>

      <Panel title="Последние срезы датасета" subtitle="Таблица даёт быстрый обзор того, на каких данных обучались модели.">
        <Table
          columns={["ID", "Окно", "Горизонт", "Строк", "Примеров", "Признаков", "Целей", "Создан"]}
          rows={(datasetsQuery.data ?? []).map((dataset) => [
            dataset.id.slice(0, 8),
            String(dataset.input_len_hours),
            String(dataset.forecast_horizon_hours),
            String(dataset.master_row_count),
            String(dataset.sample_count),
            String(dataset.feature_columns.length),
            String(dataset.target_columns.length),
            formatDateTime(dataset.created_at),
          ])}
        />
      </Panel>
    </div>
  );
}
