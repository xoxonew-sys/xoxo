import { useState, useEffect, useCallback } from "react";

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  duration?: number;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((listener) => listener([...toasts]));
}

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  emit();
}

function push(toast: Omit<Toast, "id">) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const next: Toast = { id, duration: 4000, variant: "default", ...toast };
  toasts = [...toasts, next];
  emit();
  timers.set(id, setTimeout(() => dismiss(id), next.duration));
  return id;
}

/**
 * Modül seviyesinde tek bir kuyruk tutar; hangi bileşenden çağrılırsa
 * çağrılsın aynı listeye yazar. Provider gerektirmez.
 */
export function useToast() {
  const [current, setCurrent] = useState<Toast[]>(toasts);

  useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);

  const toast = useCallback((options: Omit<Toast, "id">) => push(options), []);

  return { toast, toasts: current, dismiss };
}
