"use client";

import { useCallback, useState } from "react";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";

// Simple toast state pair: const { toast, showToast, ToastElement } = useToast();
// showToast("Office add ho gaya", "success"); render {ToastElement} kahin bhi.
export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback((message: string, kind: ToastKind = "success") => {
    setToast({ message, kind });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const ToastElement = <Toast toast={toast} onClose={clearToast} />;

  return { toast, showToast, clearToast, ToastElement };
}
