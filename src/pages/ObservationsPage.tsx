import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionHint, FieldHint, FormMessage, OperationResult, PageHeader, Panel, ScheduleField, SeverityBadge, StatusBadge, Table } from "../components/ui";
import { api, getApiErrorMessage } from "../lib/api";
import {
  formatDateTime,
  formatMetricName,
  formatNumber,
  formatSourceName,
  fromDateTimeLocalValue,
  getMetricSeverity,
  humanizeOperation,
  toDateTimeLocalValue,
} from "../lib/format";
import { useTaskTracker } from "../hooks/useTaskTracker";

type ResultState = {
  title: string;
  status?: string | null;
  items: Array<{ label: string; value: string }>;
  raw?: unknown;
};

export function ObservationsPage() {
  const queryClient = useQueryClient();
  const { addTask } = useTaskTracker();
  const [feedback, setFeedback] = useState<ResultState | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [filters, setFilters] = useState({
    metric: "",
    source: "",
    limit: 100,
  });
  const [collectForm, setCollectForm] = useState({
    start: toDateTimeLocalValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    finish: toDateTimeLocalValue(new Date()),
    interval: "Interval1H",
    window_hours: 1,
    scheduled_for: "",
  });

  const observationsQuery = useQuery({
    queryKey: ["observations", filters],
    queryFn: () => api.listObservations(filters),
  });

  const syncMutation = useMutation({
    mutationFn: api.collectObservations,
    onSuccess: async (result) => {
      setFormMessage("");
      setFeedback({
        title: "Сбор наблюдений завершён",
        status: "success",
        items: [
          { label: "Получено", value: String(result.raw_count) },
          { label: "Очищено", value: String(result.cleaned_count) },
          { label: "Создано", value: String(result.db_created_count) },
          { label: "Обновлено", value: String(result.db_updated_count) },
        ],
        raw: result,
      });
      await queryClient.invalidateQueries({ queryKey: ["observations"] });
    },
    onError: (error) => {
      setFormMessage(getApiErrorMessage(error, "Не удалось собрать наблюдения."));
    },
  });

  const asyncMutation = useMutation({
    mutationFn: api.collectObservationsAsync,
    onSuccess: (result) => {
      setFormMessage("");
      addTask({
        taskId: result.task_id,
        operation: result.operation,
        createdAt: new Date().toISOString(),
        note: result.is_scheduled ? "Отложенный сбор наблюдений" : "Фоновый сбор наблюдений",
        scheduledTaskId: result.scheduled_task_id,
        scheduledFor: result.scheduled_for,
        isScheduled: result.is_scheduled,
      });
      setFeedback({
        title: result.is_scheduled ? "Сбор наблюдений запланирован" : "Сбор наблюдений поставлен в очередь",
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
      setFormMessage(getApiErrorMessage(error, "Не удалось поставить сбор наблюдений в очередь."));
    },
  });

  function buildPayload() {
    return {
      start: fromDateTimeLocalValue(collectForm.start) ?? new Date().toISOString(),
      finish: fromDateTimeLocalValue(collectForm.finish) ?? new Date().toISOString(),
      interval: collectForm.interval,
      window_hours: Number(collectForm.window_hours),
      scheduled_for: fromDateTimeLocalValue(collectForm.scheduled_for),
    };
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Сбор данных"
        title="Наблюдения и сбор данных"
        description="Просмотр последних наблюдений и ручной запуск синхронного или фонового сбора данных из внешних источников."
      />

      <Panel title="Фильтры и запуск сбора" subtitle="Можно запустить сбор сразу или отправить его в очередь с отложенным стартом.">
        <div className="form-grid">
          <label>
            <span>Метрика</span>
            <input value={filters.metric} onChange={(event) => setFilters({ ...filters, metric: event.target.value })} placeholder="pm25" />
            <FieldHint>Фильтр для таблицы ниже. Оставь пустым, если хочешь видеть все метрики сразу.</FieldHint>
          </label>
          <label>
            <span>Источник</span>
            <input value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} placeholder="mycityair" />
            <FieldHint>Источник данных в таблице. Обычно это `mycityair` или другой провайдер из backend.</FieldHint>
          </label>
          <label>
            <span>Лимит</span>
            <input
              type="number"
              min={1}
              max={500}
              value={filters.limit}
              onChange={(event) => setFilters({ ...filters, limit: Number(event.target.value) })}
            />
            <FieldHint>Сколько записей показывать в списке наблюдений. Для обычной работы хватает 50-100.</FieldHint>
          </label>
          <label>
            <span>Интервал</span>
            <select value={collectForm.interval} onChange={(event) => setCollectForm({ ...collectForm, interval: event.target.value })}>
              <option value="Interval1H">1 час</option>
              <option value="Interval3H">3 часа</option>
              <option value="Interval24H">24 часа</option>
            </select>
            <FieldHint>Шаг агрегации при сборе. Для большинства сценариев подходит интервал в 1 час.</FieldHint>
          </label>
          <label>
            <span>Старт окна</span>
            <input
              type="datetime-local"
              value={collectForm.start}
              onChange={(event) => setCollectForm({ ...collectForm, start: event.target.value })}
            />
            <FieldHint>Начало периода, за который backend пойдёт во внешние источники. Для первого запуска лучше брать не 24-48 часов, а 5-7 суток истории.</FieldHint>
          </label>
          <label>
            <span>Финиш окна</span>
            <input
              type="datetime-local"
              value={collectForm.finish}
              onChange={(event) => setCollectForm({ ...collectForm, finish: event.target.value })}
            />
            <FieldHint>Конец периода. Для обучения модели с окном 72 ч и горизонтом 24 ч обычно нужно минимум 98-120 часовых точек.</FieldHint>
          </label>
          <label>
            <span>Размер окна, ч</span>
            <input
              type="number"
              min={1}
              value={collectForm.window_hours}
              onChange={(event) => setCollectForm({ ...collectForm, window_hours: Number(event.target.value) })}
            />
            <FieldHint>Размер окна для одного запроса к провайдерам. Обычно оставляют `1`.</FieldHint>
          </label>
          <ScheduleField
            value={collectForm.scheduled_for}
            onChange={(event) => setCollectForm({ ...collectForm, scheduled_for: event.target.value })}
          />
        </div>
        <ActionHint>Сначала укажи период и шаг агрегации. На свежем стенде сначала собери хотя бы 5-7 суток истории, иначе датасет с типичными параметрами 72/24 не соберётся.</ActionHint>
        {formMessage ? <FormMessage tone="error">{formMessage}</FormMessage> : null}
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => syncMutation.mutate(buildPayload())}>
            Синхронно собрать
          </button>
          <button type="button" className="secondary-button" onClick={() => asyncMutation.mutate(buildPayload())}>
            Поставить в очередь
          </button>
        </div>
        {feedback ? <OperationResult title={feedback.title} status={feedback.status} items={feedback.items} raw={feedback.raw} /> : null}
      </Panel>

      <Panel title="Последние наблюдения" subtitle="Таблица обновляется после успешного запуска сбора и при повторном запросе данных.">
        <Table
          columns={["Время", "Источник", "Станция", "Метрика", "Значение", "Ед.", "Тип"]}
          rows={(observationsQuery.data ?? []).map((item) => [
            formatDateTime(item.observed_at_utc),
            formatSourceName(item.source),
            item.station_name || item.station_id || "-",
            formatMetricName(item.metric),
            <div className="reading-cell">
              <span className={`reading-pill reading-${getMetricSeverity(item.metric, item.value)}`}>{formatNumber(item.value)}</span>
              <SeverityBadge severity={getMetricSeverity(item.metric, item.value)} />
            </div>,
            item.unit || "-",
            <StatusBadge status={item.source_kind || "сырые"} />,
          ])}
        />
      </Panel>
    </div>
  );
}
