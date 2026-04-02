import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, JsonPreview, PageHeader, Panel, StatusBadge, Table } from "../components/ui";
import { useTaskTracker } from "../hooks/useTaskTracker";
import { api } from "../lib/api";
import { formatDateTime, formatFullDateTime, humanizeOperation } from "../lib/format";

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

  const rows = tasks.map((task, index) => {
    const status = taskQueries[index]?.data;
    const scheduledTask = scheduledTasksQuery.data?.find((item) => item.id === task.scheduledTaskId);
    return [
      task.taskId.slice(0, 8),
      humanizeOperation(task.operation),
      <StatusBadge status={task.isScheduled ? scheduledTask?.status ?? "scheduled" : status?.status ?? "queued"} />,
      task.scheduledFor ? formatDateTime(task.scheduledFor) : task.note ?? "-",
      formatDateTime(task.createdAt),
      <button type="button" className="table-button" onClick={() => removeTask(task.taskId)}>
        Убрать
      </button>,
    ];
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Фоновые задачи"
        title="Очередь и фоновые задачи"
        description="Отслеживание фоновых и отложенных задач, созданных из интерфейса."
        actions={
          <button type="button" className="ghost-button" onClick={clearTasks}>
            Очистить список
          </button>
        }
      />

      <Panel title="Добавить внешний ID задачи" subtitle="Если задача была создана вне этого браузера, её тоже можно добавить в локальный мониторинг.">
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

      <Panel title="Отслеживаемые задачи" subtitle="Сохранены в localStorage браузера, чтобы не терять контекст между переходами по страницам.">
        {tasks.length ? (
          <Table columns={["ID", "Операция", "Статус", "Комментарий / время", "Создано", "Действие"]} rows={rows} />
        ) : (
          <EmptyState title="Нет отслеживаемых задач" description="Добавьте ID задачи вручную или запустите любую фоновую операцию на других страницах." />
        )}
      </Panel>

      <Panel title="Отложенные задачи" subtitle="Список плановых задач текущего пользователя из backend.">
        {scheduledTasksQuery.data?.length ? (
          <Table
            columns={["Операция", "Статус", "Запланирована", "Начата", "Завершена", "Действие"]}
            rows={scheduledTasksQuery.data.map((task) => [
              humanizeOperation(task.operation),
              <StatusBadge status={task.status} />,
              formatFullDateTime(task.scheduled_for),
              formatDateTime(task.started_at),
              formatDateTime(task.finished_at),
              task.status === "scheduled" ? (
                <button
                  type="button"
                  className="table-button"
                  onClick={() => cancelScheduledTaskMutation.mutate(task.id)}
                >
                  Отменить
                </button>
              ) : (
                "-"
              ),
            ])}
          />
        ) : (
          <EmptyState title="Запланированных задач пока нет" description="Они появятся после фонового запуска с заполненным полем даты." />
        )}
      </Panel>

      {tasks.map((task, index) => {
        const status = taskQueries[index]?.data;
        if (!status && !task.isScheduled) {
          return null;
        }

        return (
          <Panel key={task.taskId} title={`Задача ${task.taskId.slice(0, 8)}`} subtitle={`Операция: ${humanizeOperation(task.operation)}`}>
            <JsonPreview value={status ?? task} />
          </Panel>
        );
      })}

      {scheduledTasksQuery.data?.slice(0, 6).map((task) => (
        <Panel key={task.id} title={`Отложенная задача: ${humanizeOperation(task.operation)}`} subtitle={task.id}>
          <JsonPreview value={task} />
        </Panel>
      ))}
    </div>
  );
}
