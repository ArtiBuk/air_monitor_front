import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, JsonPreview, PageHeader, Panel, StatusBadge } from "../components/ui";
import { useTaskTracker, type TrackedTask } from "../hooks/useTaskTracker";
import { api } from "../lib/api";
import {
  asObject,
  formatDateTime,
  formatFullDateTime,
  formatMetricList,
  formatNumber,
  formatSourceList,
  humanizeOperation,
} from "../lib/format";
import type { AsyncTaskStatus, ScheduledTask } from "../types/api";

type SummaryItem = { label: string; value: string };

function shortenId(value: string | null | undefined, size = 8) {
  return value ? value.slice(0, size) : "-";
}

function resolveTaskStatus(task: TrackedTask, status: AsyncTaskStatus | undefined, scheduledTask?: ScheduledTask | null) {
  if (task.isScheduled) {
    return scheduledTask?.status ?? "scheduled";
  }

  return status?.status ?? "queued";
}

function describeTaskState(task: TrackedTask, status: AsyncTaskStatus | undefined, scheduledTask?: ScheduledTask | null) {
  const resolvedStatus = resolveTaskStatus(task, status, scheduledTask);

  if (status?.error || scheduledTask?.error) {
    return "Задача завершилась с ошибкой и требует внимания.";
  }

  if (task.scheduledFor) {
    return `Запуск назначен на ${formatFullDateTime(task.scheduledFor)}.`;
  }

  if (resolvedStatus === "completed" || resolvedStatus === "success" || resolvedStatus === "ready") {
    return "Задача завершилась успешно.";
  }

  if (resolvedStatus === "running" || resolvedStatus === "started" || resolvedStatus === "processing") {
    return "Задача сейчас выполняется.";
  }

  if (resolvedStatus === "cancelled") {
    return "Задача была отменена до завершения.";
  }

  if (task.note) {
    return task.note;
  }

  return "Задача ожидает запуска или обновления статуса.";
}

function buildTaskComment(task: TrackedTask, status: AsyncTaskStatus | undefined, scheduledTask?: ScheduledTask | null) {
  if (status?.error) {
    return status.error;
  }

  if (scheduledTask?.error) {
    return scheduledTask.error;
  }

  if (task.note) {
    return task.note;
  }

  return describeTaskState(task, status, scheduledTask);
}

function summarizeAsyncResult(result: AsyncTaskStatus["result"]) {
  const payload = asObject(result);
  const summary: SummaryItem[] = [];

  if (typeof payload.raw_count === "number") {
    summary.push({ label: "Получено наблюдений", value: formatNumber(payload.raw_count, "0") });
  }
  if (typeof payload.cleaned_count === "number") {
    summary.push({ label: "После очистки", value: formatNumber(payload.cleaned_count, "0") });
  }
  if (typeof payload.db_created_count === "number") {
    summary.push({ label: "Новых записей", value: formatNumber(payload.db_created_count, "0") });
  }
  if (typeof payload.db_updated_count === "number") {
    summary.push({ label: "Обновлено записей", value: formatNumber(payload.db_updated_count, "0") });
  }
  if (typeof payload.dataset_id === "string") {
    summary.push({ label: "Набор данных", value: shortenId(payload.dataset_id) });
  }
  if (typeof payload.model_version_id === "string") {
    summary.push({ label: "Версия модели", value: shortenId(payload.model_version_id) });
  }
  if (typeof payload.forecast_run_id === "string") {
    summary.push({ label: "Прогноз", value: shortenId(payload.forecast_run_id) });
  }
  if (typeof payload.evaluation_id === "string") {
    summary.push({ label: "Оценка", value: shortenId(payload.evaluation_id) });
  }
  if (typeof payload.detail === "string") {
    summary.push({ label: "Итог", value: payload.detail });
  }

  return summary.slice(0, 6);
}

function summarizeScheduledTask(task: ScheduledTask) {
  const payload = asObject(task.payload);
  const summary: SummaryItem[] = [];

  if (Array.isArray(payload.sources)) {
    summary.push({ label: "Источники", value: formatSourceList(payload.sources.filter((item): item is string => typeof item === "string")) });
  }
  if (Array.isArray(payload.metrics)) {
    summary.push({ label: "Метрики", value: formatMetricList(payload.metrics.filter((item): item is string => typeof item === "string")) });
  }
  if (typeof payload.start === "string" && typeof payload.finish === "string") {
    summary.push({ label: "Период данных", value: `${formatDateTime(payload.start)} → ${formatDateTime(payload.finish)}` });
  }
  if (typeof payload.input_len_hours === "number" && typeof payload.forecast_horizon_hours === "number") {
    summary.push({ label: "История / прогноз", value: `${payload.input_len_hours} ч / ${payload.forecast_horizon_hours} ч` });
  }
  if (typeof payload.generated_from_timestamp_utc === "string") {
    summary.push({ label: "Опорный момент", value: formatFullDateTime(payload.generated_from_timestamp_utc) });
  }
  if (typeof payload.name === "string") {
    summary.push({ label: "Сценарий", value: payload.name });
  }

  return summary.slice(0, 6);
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const { tasks, addTask, removeTask, clearTasks } = useTaskTracker();
  const [manualTaskId, setManualTaskId] = useState("");
  const scheduledTasksQuery = useQuery({
    queryKey: ["scheduled-tasks"],
    queryFn: () => api.listScheduledTasks({ limit: 20 }),
    refetchInterval: 4_000,
  });

  const taskQueries = useQueries({
    queries: tasks.map((task) => ({
      queryKey: ["task-status", task.taskId],
      queryFn: () => api.getTaskStatus(task.taskId),
      refetchInterval: task.isScheduled ? false : 4_000,
    })),
  });

  const cancelScheduledTaskMutation = useMutation({
    mutationFn: api.cancelScheduledTask,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });
    },
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Фоновые задачи"
        title="Ход вычислений"
        description="Здесь собраны текущие и отложенные операции: что уже запущено, что ожидает времени старта и чем закончились предыдущие расчёты."
        actions={
          <button type="button" className="ghost-button" onClick={clearTasks}>
            Очистить список
          </button>
        }
      />

      <Panel
        title="Добавить внешнюю задачу"
        subtitle="Если операция была запущена вне этого браузера, сюда можно подставить её ID и отслеживать результат в общем списке."
      >
        <div className="button-row">
          <input value={manualTaskId} onChange={(event) => setManualTaskId(event.target.value)} placeholder="ID задачи Celery" />
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (!manualTaskId.trim()) {
                return;
              }
              addTask({
                taskId: manualTaskId.trim(),
                operation: "внешняя_задача",
                createdAt: new Date().toISOString(),
                note: "Добавлено вручную",
              });
              setManualTaskId("");
            }}
          >
            Добавить
          </button>
        </div>
      </Panel>

      <Panel title="Отслеживаемые задачи" subtitle="Недавние операции в нормальном виде: статус, время запуска, результат и краткое объяснение без лишнего шума.">
        {tasks.length ? (
          <div className="task-stack">
            {tasks.map((task, index) => {
              const status = taskQueries[index]?.data;
              const scheduledTask = scheduledTasksQuery.data?.find((item) => item.id === task.scheduledTaskId) ?? null;
              const summary = summarizeAsyncResult(status?.result ?? null);

              return (
                <div key={task.taskId} className="result-card task-card">
                  <div className="task-card-head">
                    <div className="task-card-title">
                      <strong>{humanizeOperation(task.operation)}</strong>
                      <p>{describeTaskState(task, status, scheduledTask)}</p>
                    </div>
                    <div className="task-card-actions">
                      <StatusBadge status={resolveTaskStatus(task, status, scheduledTask)} />
                      <button type="button" className="table-button" onClick={() => removeTask(task.taskId)}>
                        Убрать
                      </button>
                    </div>
                  </div>
                  <div className="task-card-meta">
                    <div className="result-item">
                      <span>ID задачи</span>
                      <strong>{shortenId(task.taskId, 12)}</strong>
                    </div>
                    <div className="result-item">
                      <span>Создано</span>
                      <strong>{formatFullDateTime(task.createdAt)}</strong>
                    </div>
                    <div className="result-item">
                      <span>Запуск</span>
                      <strong>{task.scheduledFor ? formatFullDateTime(task.scheduledFor) : "Сразу после постановки"}</strong>
                    </div>
                    <div className="result-item">
                      <span>Комментарий</span>
                      <strong>{buildTaskComment(task, status, scheduledTask)}</strong>
                    </div>
                  </div>
                  {summary.length ? (
                    <div className="task-card-summary">
                      {summary.map((item) => (
                        <div key={`${task.taskId}-${item.label}`} className="result-item">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {status?.error ? <p className="panel-note">Ошибка: {status.error}</p> : null}
                  <details className="details-card">
                    <summary>Технические детали</summary>
                    <JsonPreview value={status ?? task} />
                  </details>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Нет отслеживаемых задач" description="Добавь ID вручную или запусти любую операцию на других страницах, и она появится здесь." />
        )}
      </Panel>

      <Panel title="Отложенные задачи" subtitle="Операции, которые уже запланированы на конкретное время и ждут своего запуска.">
        {scheduledTasksQuery.data?.length ? (
          <div className="task-stack">
            {scheduledTasksQuery.data.slice(0, 8).map((task) => {
              const summary = summarizeScheduledTask(task);

              return (
                <div key={task.id} className="result-card task-card">
                  <div className="task-card-head">
                    <div className="task-card-title">
                      <strong>{humanizeOperation(task.operation)}</strong>
                      <p>
                        {task.error
                          ? `Во время выполнения возникла ошибка: ${task.error}`
                          : task.status === "scheduled"
                            ? "Задача ждёт своего времени запуска."
                            : task.status === "started" || task.status === "running"
                              ? "Задача уже стартовала и сейчас выполняется."
                              : "Запланированная задача обработана системой."}
                      </p>
                    </div>
                    <div className="task-card-actions">
                      <StatusBadge status={task.status} />
                      {task.status === "scheduled" ? (
                        <button type="button" className="table-button" onClick={() => cancelScheduledTaskMutation.mutate(task.id)}>
                          Отменить
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="task-card-meta">
                    <div className="result-item">
                      <span>ID плановой задачи</span>
                      <strong>{shortenId(task.id, 12)}</strong>
                    </div>
                    <div className="result-item">
                      <span>Запланирована</span>
                      <strong>{formatFullDateTime(task.scheduled_for)}</strong>
                    </div>
                    <div className="result-item">
                      <span>Начата</span>
                      <strong>{formatDateTime(task.started_at)}</strong>
                    </div>
                    <div className="result-item">
                      <span>Завершена</span>
                      <strong>{formatDateTime(task.finished_at)}</strong>
                    </div>
                  </div>
                  {summary.length ? (
                    <div className="task-card-summary">
                      {summary.map((item) => (
                        <div key={`${task.id}-${item.label}`} className="result-item">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {task.error ? <p className="panel-note">Ошибка: {task.error}</p> : null}
                  <details className="details-card">
                    <summary>Технические детали</summary>
                    <JsonPreview value={task} />
                  </details>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Запланированных задач пока нет" description="Они появятся после запуска операций с выбранной датой и временем." />
        )}
      </Panel>
    </div>
  );
}
