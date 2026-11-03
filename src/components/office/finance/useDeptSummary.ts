"use client";

import { useCallback, useState } from "react";
import { officeFetch } from "@/lib/office/client";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { normalizeDeptSummary, type DeptCommissionSummaryUser } from "./types";

// §W51 — department users ka summary (commission + kharche) ek hi fetch:
// Finance ke KPI ("Payable expenses"), Department commissions aur Department
// kharche teeno isi se (do dafa load nahi).
export function useDeptSummary(): DeptCommissionSummaryUser[] | null {
  const [users, setUsers] = useState<DeptCommissionSummaryUser[] | null>(null);
  const load = useCallback(async () => {
    const res = await officeFetch<{ ok: boolean; users: unknown[] }>("/api/office/dept-commissions/summary");
    if (res.ok) setUsers(normalizeDeptSummary(res.data));
  }, []);
  // Mount fetch + office:changed/polling live refresh (silent).
  useLiveRefresh(load, { immediate: true });
  return users;
}

// Admin ne department users ko kharchon ki kitni wapsi deni hai (courier + other).
export function payableDeptExpenses(users: DeptCommissionSummaryUser[] | null) {
  return (users ?? []).reduce((acc, user) => acc + user.courier.remaining + user.other.remaining, 0);
}
