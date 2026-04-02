import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionHint, EmptyState, FieldHint, FormMessage, KeyMetricRow, OperationResult, PageHeader, Panel, ScheduleField, StatusBadge, Table } from "../components/ui";
import { useTaskTracker } from "../hooks/useTaskTracker";
import { ApiError, api, getApiErrorMessage } from "../lib/api";
import { asObject, formatDateTime, formatNumber, fromDateTimeLocalValue, getNestedMetric, humanizeOperation, joinList } from "../lib/format";

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

export function ModelsPage() {
  const queryClient = useQueryClient();
  const { addTask } = useTaskTracker();
  const [feedback, setFeedback] = useState<{
    title: string;
    status?: string | null;
    items: Array<{ label: string; value: string }>;
    raw?: unknown;
  } | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [form, setForm] = useState({
    dataset_snapshot_id: "",
    epochs: 32,
    batch_size: 16,
    lr: 0.001,
    weight_decay: 0.0001,
    patience: 8,
    seed: 42,
    scheduled_for: "",
  });

  const datasetsQuery = useQuery({ queryKey: ["models", "datasets"], queryFn: () => api.listDatasets(20) });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: () => api.listModels(12) });
  const activeModelQuery = useQuery({ queryKey: ["models", "active"], queryFn: () => queryOrNull(() => api.getActiveModel()) });
  const leaderboardQuery = useQuery({ queryKey: ["models", "leaderboard"], queryFn: () => api.getModelLeaderboard("overall_rmse", 8) });

  useEffect(() => {
    if (!datasetsQuery.data?.length) {
      return;
    }

    setForm((current) => (current.dataset_snapshot_id ? current : { ...current, dataset_snapshot_id: datasetsQuery.data[0].id }));
  }, [datasetsQuery.data]);

  function buildPayload() {
    return {
      dataset_snapshot_id: form.dataset_snapshot_id || null,
      epochs: Number(form.epochs),
      batch_size: Number(form.batch_size),
      lr: Number(form.lr),
      weight_decay: Number(form.weight_decay),
      patience: Number(form.patience),
      seed: Number(form.seed),
      scheduled_for: fromDateTimeLocalValue(form.scheduled_for),
    };
  }

  const syncMutation = useMutation({
    mutationFn: api.trainModel,
    onSuccess: async (result) => {
      setFormMessage("");
      const metrics = asObject(result.metrics);
      setFeedback({
        title: "Модель обучена",
        status: result.status,
        items: [
          { label: "Модель", value: result.name },
          { label: "Датасет", value: result.dataset?.slice(0, 8) ?? "-" },
          { label: "Целевые метрики", value: joinList(result.target_names) },
          { label: "Ошибка RMSE", value: formatNumber(getNestedMetric(metrics, "summary", "overall_rmse")) },
        ],
        raw: result,
      });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось обучить модель."));
    },
  });

  const asyncMutation = useMutation({
    mutationFn: api.trainModelAsync,
    onSuccess: (result) => {
      setFormMessage("");
      addTask({
        taskId: result.task_id,
        operation: result.operation,
        createdAt: new Date().toISOString(),
        note: result.is_scheduled ? "Отложенное обучение модели" : "Фоновое обучение модели",
        scheduledTaskId: result.scheduled_task_id,
        scheduledFor: result.scheduled_for,
        isScheduled: result.is_scheduled,
      });
      setFeedback({
        title: result.is_scheduled ? "Обучение модели запланировано" : "Обучение модели поставлено в очередь",
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
      setFormMessage(getApiErrorMessage(error, "Не удалось запустить обучение через очередь."));
    },
  });

  const activeMetrics = asObject(activeModelQuery.data?.metrics);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Обучение моделей"
        title="Обучение и анализ моделей"
        description="Экран для обучения моделей, просмотра готовых версий и анализа агрегированных метрик по результатам ретропроверки."
      />

      <div className="dashboard-grid">
        <Panel title="Обучение модели" subtitle="Можно обучать либо на выбранном срезе датасета, либо позволить backend взять актуальный срез по умолчанию.">
          <div className="form-grid">
            <label className="full-span">
              <span>Срез датасета</span>
              <select
                value={form.dataset_snapshot_id}
                onChange={(event) => setForm({ ...form, dataset_snapshot_id: event.target.value })}
              >
                <option value="">Автовыбор / последний подходящий</option>
                {(datasetsQuery.data ?? []).map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.id.slice(0, 8)} · {dataset.input_len_hours}h / {dataset.forecast_horizon_hours}h · samples {dataset.sample_count}
                  </option>
                ))}
              </select>
              <FieldHint>Если в системе уже есть срезы датасета, последний подставляется автоматически. При желании его можно сменить вручную.</FieldHint>
            </label>
            <label>
              <span>Эпохи</span>
              <input type="number" value={form.epochs} onChange={(event) => setForm({ ...form, epochs: Number(event.target.value) })} />
              <FieldHint>Количество эпох обучения. Для быстрого прогона ставь `2-5`, для серьёзного уже больше.</FieldHint>
            </label>
            <label>
              <span>Размер батча</span>
              <input
                type="number"
                value={form.batch_size}
                onChange={(event) => setForm({ ...form, batch_size: Number(event.target.value) })}
              />
              <FieldHint>Размер батча. Безопасное стартовое значение обычно `8` или `16`.</FieldHint>
            </label>
            <label>
              <span>Скорость обучения</span>
              <input type="number" step="0.0001" value={form.lr} onChange={(event) => setForm({ ...form, lr: Number(event.target.value) })} />
              <FieldHint>Шаг оптимизации. Если не экспериментируешь, оставляй базовое значение.</FieldHint>
            </label>
            <label>
              <span>Регуляризация</span>
              <input
                type="number"
                step="0.0001"
                value={form.weight_decay}
                onChange={(event) => setForm({ ...form, weight_decay: Number(event.target.value) })}
              />
              <FieldHint>Регуляризация для борьбы с переобучением. Обычно трогают редко.</FieldHint>
            </label>
            <label>
              <span>Терпение early stop</span>
              <input
                type="number"
                value={form.patience}
                onChange={(event) => setForm({ ...form, patience: Number(event.target.value) })}
              />
              <FieldHint>Через сколько неудачных эпох обучение остановится досрочно.</FieldHint>
            </label>
            <label>
              <span>Случайное зерно</span>
              <input type="number" value={form.seed} onChange={(event) => setForm({ ...form, seed: Number(event.target.value) })} />
              <FieldHint>Фиксирует воспроизводимость результата. Обычно оставляют одно и то же число.</FieldHint>
            </label>
            <ScheduleField
              value={form.scheduled_for}
              onChange={(event) => setForm({ ...form, scheduled_for: event.target.value })}
            />
          </div>
          <ActionHint>Если срез датасета уже есть, форма сама подставит его в обучение. Для быстрой проверки обычно достаточно 2-5 эпох и небольшого размера батча.</ActionHint>
          {formMessage ? <FormMessage tone="error">{formMessage}</FormMessage> : null}
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => syncMutation.mutate(buildPayload())}>
              Обучить синхронно
            </button>
            <button type="button" className="secondary-button" onClick={() => asyncMutation.mutate(buildPayload())}>
              Запустить через Celery
            </button>
          </div>
          {feedback ? <OperationResult title={feedback.title} status={feedback.status} items={feedback.items} raw={feedback.raw} /> : null}
        </Panel>

        <Panel title="Активная модель" subtitle="Показывает текущую основную модель, которую frontend и backend считают базовой.">
          {activeModelQuery.data ? (
            <div className="detail-stack">
              <div className="inline-summary">
                <StatusBadge status={activeModelQuery.data.status} />
                <span className="pill">{activeModelQuery.data.name}</span>
              </div>
              <KeyMetricRow label="Общая RMSE" value={getNestedMetric(activeMetrics, "summary", "overall_rmse")} />
              <KeyMetricRow label="Общая MAE" value={getNestedMetric(activeMetrics, "summary", "overall_mae")} />
              <KeyMetricRow label="Макро MAPE" value={getNestedMetric(activeMetrics, "summary", "macro_mape")} />
            </div>
          ) : (
            <EmptyState title="Нет активной модели" description="После первого обучения этот блок станет основным источником для текущей базовой модели." />
          )}
        </Panel>
      </div>

      <div className="dashboard-grid">
        <Panel title="Версии моделей" subtitle="Последние версии модели с их базовыми метриками обучения.">
          <Table
            columns={["Имя", "Статус", "Датасет", "RMSE", "MAE", "Создана"]}
            rows={(modelsQuery.data ?? []).map((model) => {
              const metrics = asObject(model.metrics);
              return [
                model.name,
                <StatusBadge status={model.status} />,
                model.dataset?.slice(0, 8) ?? "-",
                formatNumber(getNestedMetric(metrics, "summary", "overall_rmse")),
                formatNumber(getNestedMetric(metrics, "summary", "overall_mae")),
                formatDateTime(model.created_at),
              ];
            })}
          />
        </Panel>

        <Panel title="Лидерборд по оценке" subtitle="Агрегированная аналитика по метрикам ретропроверки и оценки прогноза.">
          <Table
            columns={["Модель", "Оценок", "RMSE", "MAE", "Покрытие"]}
            rows={(leaderboardQuery.data ?? []).map((row) => [
              row.model_name,
              String(row.evaluation_count),
              formatNumber(row.avg_overall_rmse),
              formatNumber(row.avg_overall_mae),
              formatNumber(row.avg_coverage_ratio),
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}
