import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";

export interface TrackedTask {
  taskId: string;
  operation: string;
  createdAt: string;
  note?: string;
  scheduledTaskId?: string | null;
  scheduledFor?: string | null;
  isScheduled?: boolean;
}

interface TaskTrackerContextValue {
  tasks: TrackedTask[];
  addTask: (task: TrackedTask) => void;
  removeTask: (taskId: string) => void;
  clearTasks: () => void;
}

const STORAGE_KEY = "air-monitor-front.tasks";

const TaskTrackerContext = createContext<TaskTrackerContextValue | null>(null);

function readTasks(): TrackedTask[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as TrackedTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function TaskTrackerProvider({ children }: PropsWithChildren) {
  const [tasks, setTasks] = useState<TrackedTask[]>(() => readTasks());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const value: TaskTrackerContextValue = {
    tasks,
    addTask: (task) => {
      setTasks((current) => [task, ...current.filter((item) => item.taskId !== task.taskId)].slice(0, 30));
    },
    removeTask: (taskId) => {
      setTasks((current) => current.filter((item) => item.taskId !== taskId));
    },
    clearTasks: () => {
      setTasks([]);
    },
  };

  return <TaskTrackerContext.Provider value={value}>{children}</TaskTrackerContext.Provider>;
}

export function useTaskTracker() {
  const context = useContext(TaskTrackerContext);

  if (!context) {
    throw new Error("useTaskTracker must be used within TaskTrackerProvider.");
  }

  return context;
}
