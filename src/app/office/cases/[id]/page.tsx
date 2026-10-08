"use client";

import { use, useCallback, useEffect, useState } from "react";
import { CreditCard, FolderOpen, History, LayoutGrid, MessageSquare, Stamp } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import { SkeletonRows, SkeletonTiles } from "@/components/ui/Skeleton";
import CaseCommandBar from "@/components/office/case/CaseCommandBar";
import CaseStatusHeader from "@/components/office/case/CaseStatusHeader";
import CaseWarningStrip from "@/components/office/case/CaseWarningStrip";
import CaseOverviewTab from "@/components/office/case/CaseOverviewTab";
import CasePaymentsTab from "@/components/office/case/CasePaymentsTab";
import CaseAttestationsTab from "@/components/office/case/CaseAttestationsTab";
import CaseFilesTab from "@/components/office/case/CaseFilesTab";
import CaseRemarksTab from "@/components/office/case/CaseRemarksTab";
import CaseHistoryTab from "@/components/office/case/CaseHistoryTab";
import FilingCaseView from "@/components/office/case/FilingCaseView";
import { officeFetch } from "@/lib/office/client";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import type { CaseDetail } from "@/lib/office/types";

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "attestations", label: "Attestations & Dates", icon: Stamp },
  { key: "files", label: "Files", icon: FolderOpen },
  { key: "remarks", label: "Remarks", icon: MessageSquare },
  { key: "history", label: "History / Finance", icon: History },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set(["overview"]));
  const [pendingReasons, setPendingReasons] = useState<string[]>([]);
  const setMessage = (m: string, kind: ToastKind = "success") =>
    setToast(m ? { message: m, kind } : null);

  const reload = useCallback(async () => {
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${id}`);
    if (res.ok) setDetail(res.data);
    else setError(res.error);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // §W11.5: detail page bhi live rehta hai (15s polling + focus + office:changed).
  useLiveRefresh(reload);

  // Lazy render: tab pehli dafa khulne par hi mount hota hai (files/remarks ki
  // apni fetch tab hi chalti hai); baad mein mounted rehta hai taake state bache.
  function openTab(tab: string) {
    const key = tab as TabKey;
    setActiveTab(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  return (
    <OfficePageFrame>
      {(admin) =>
        // §N7: filing department ko sirf limited view milta hai (API ka
        // payload bhi stripped hai) — koi payment/money section nahi.
        admin.role === "filing" ? (
          <FilingCaseView id={id} admin={admin} />
        ) : (
          <div className="space-y-4">
            <Toast toast={toast} onClose={() => setToast(null)} />
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

            {!detail ? (
              !error && (
                <div className="space-y-4 pt-4">
                  <SkeletonTiles tiles={4} />
                  <SkeletonRows rows={6} />
                </div>
              )
            ) : (
              <>
                <CaseCommandBar detail={detail} admin={admin} onUpdated={setDetail} onMessage={setMessage} />
                <CaseStatusHeader detail={detail} admin={admin} onChanged={reload} />
                <CaseWarningStrip detail={detail} pendingReasons={pendingReasons} onOpenTab={openTab} />

                {/* Tab bar — mobile par horizontally scrollable */}
                <div
                  role="tablist"
                  aria-label="Case sections"
                  className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
                >
                  {TABS.map((tab) => {
                    const active = tab.key === activeTab;
                    const Icon = tab.icon;
                    const unseenDot = tab.key === "remarks" && detail.hasUnseenWarning;
                    return (
                      <button
                        key={tab.key}
                        role="tab"
                        aria-selected={active}
                        onClick={() => openTab(tab.key)}
                        className={`relative inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                          active
                            ? "bg-primary-600 text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-700"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                        {unseenDot && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400" />}
                      </button>
                    );
                  })}
                </div>

                <div>
                  {visited.has("overview") && (
                    <div role="tabpanel" hidden={activeTab !== "overview"}>
                      <CaseOverviewTab
                        key={detail.id + detail.clientName + detail.agreedAmount + (detail.courierNumber || "") + (detail.agreedAmountRemarks || "")}
                        detail={detail}
                        admin={admin}
                        onUpdated={setDetail}
                        onReload={reload}
                        onMessage={setMessage}
                      />
                    </div>
                  )}
                  {visited.has("payments") && (
                    <div role="tabpanel" hidden={activeTab !== "payments"}>
                      <CasePaymentsTab
                        key={`${detail.commissionAmount}-${detail.extraSharePercent}-${detail.claimedRemaining}-${detail.claimedRemainingStatus}`}
                        detail={detail}
                        admin={admin}
                        onUpdated={setDetail}
                        onReload={reload}
                        onMessage={setMessage}
                      />
                    </div>
                  )}
                  {visited.has("attestations") && (
                    <div role="tabpanel" hidden={activeTab !== "attestations"}>
                      <CaseAttestationsTab
                        detail={detail}
                        admin={admin}
                        onUpdated={setDetail}
                        onReload={reload}
                        onMessage={setMessage}
                        pendingReasons={pendingReasons}
                        setPendingReasons={setPendingReasons}
                      />
                    </div>
                  )}
                  {visited.has("files") && (
                    <div role="tabpanel" hidden={activeTab !== "files"}>
                      <CaseFilesTab detail={detail} admin={admin} onReload={reload} onMessage={setMessage} />
                    </div>
                  )}
                  {visited.has("remarks") && (
                    <div role="tabpanel" hidden={activeTab !== "remarks"}>
                      <CaseRemarksTab caseId={detail.id} admin={admin} onMessage={setMessage} onChanged={reload} />
                    </div>
                  )}
                  {visited.has("history") && (
                    <div role="tabpanel" hidden={activeTab !== "history"}>
                      <CaseHistoryTab detail={detail} admin={admin} onUpdated={setDetail} onReload={reload} onMessage={setMessage} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )
      }
    </OfficePageFrame>
  );
}
