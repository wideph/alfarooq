"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
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
import DeptCaseView, { type DeptLimitedResponse } from "@/components/office/case/DeptCaseView";
import ReturnToOriginBanner from "@/components/office/case/ReturnToOriginBanner";
import DeptWorkerCaseSections from "@/components/office/case/DeptWorkerCaseSections";
import { isDeptWorkerAccess } from "@/lib/office/permissions";
import { officeFetch } from "@/lib/office/client";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { CASES_HREF, deptWorkFinished, originDept, originLabel, safeOfficeFrom } from "@/lib/office/case-nav";
import { OFFICE_CHANGED_EVENT } from "@/lib/office/live";
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

export default function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = use(params);
  // §W34: case kis tab / list se khula — wapsi (back, delete, kaam mukammal)
  // wahin; navbar bhi wahi tab active rakhta hai (OfficeNav/AdminNav).
  const fromParam = use(searchParams).from;
  const from = safeOfficeFrom(typeof fromParam === "string" ? fromParam : null);
  const backHref = from || CASES_HREF;
  const backLabel = originLabel(from);
  const fromDept = originDept(from);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  // §W18: cross-office dept worker ko limited payload milta hai
  // ({ limited: true, depts: [...] }) — DeptCaseView render hota hai.
  const [limited, setLimited] = useState<DeptLimitedResponse | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set(["overview"]));
  const [pendingReasons, setPendingReasons] = useState<string[]>([]);
  // §W34: department tab se khula + user ke apne action se us department ka
  // kaam mukammal (case us queue se nikal gaya) → khud wapsi ka banner.
  const [returning, setReturning] = useState(false);
  const statusRef = useRef<string | null>(null);
  const lastActionAtRef = useRef(0);
  useEffect(() => {
    const markAction = () => {
      lastActionAtRef.current = Date.now();
    };
    window.addEventListener(OFFICE_CHANGED_EVENT, markAction);
    return () => window.removeEventListener(OFFICE_CHANGED_EVENT, markAction);
  }, []);
  const trackStatus = useCallback(
    (nextStatus: string) => {
      const previous = statusRef.current;
      statusRef.current = nextStatus;
      if (
        fromDept &&
        previous &&
        deptWorkFinished(fromDept, previous, nextStatus) &&
        Date.now() - lastActionAtRef.current < 60_000
      )
        setReturning(true);
    },
    [fromDept]
  );
  const setMessage = (m: string, kind: ToastKind = "success") =>
    setToast(m ? { message: m, kind } : null);

  // §W20 (P2): mutation ke baad tab components explicit `onReload()` karte
  // hain AUR officeFetch ka office:changed event bhi 300ms par reload trigger
  // karta hai — dono mil kar same endpoint ki duplicate fetch. In-flight
  // promise share kar ke overlapping callers ek hi fetch use karte hain.
  const reloadInFlightRef = useRef<Promise<void> | null>(null);
  const reload = useCallback(() => {
    if (reloadInFlightRef.current) return reloadInFlightRef.current;
    const pending = (async () => {
      const res = await officeFetch<CaseDetail | DeptLimitedResponse>(`/api/office/cases/${id}`);
      if (res.ok) {
        const data = res.data as DeptLimitedResponse;
        if (data && data.limited === true && Array.isArray(data.depts) && data.detail) {
          setLimited(data);
          setDetail(null);
          trackStatus(data.detail.status);
        } else {
          setDetail(res.data as CaseDetail);
          setLimited(null);
          trackStatus((res.data as CaseDetail).status);
        }
      } else setError(res.error);
    })().finally(() => {
      if (reloadInFlightRef.current === pending) reloadInFlightRef.current = null;
    });
    reloadInFlightRef.current = pending;
    return pending;
  }, [id, trackStatus]);

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

  // §W36: dept worker ke ek-page view mein "tab kholna" = us section tak scroll.
  function scrollToSection(tab: string) {
    document.getElementById(`case-section-${tab}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
    <OfficePageFrame>
      {(admin) =>
        // §N7: filing department ko sirf limited view milta hai (API ka
        // payload bhi stripped hai) — koi payment/money section nahi.
        admin.role === "filing" ? (
          <FilingCaseView id={id} admin={admin} backHref={from || undefined} />
        ) : limited ? (
          // §W18: cross-office dept worker (filing/printing/attestation/courier
          // permission) — limited view, sirf apne departments ki files + upload.
          <DeptCaseView id={id} data={limited} onReload={reload} backHref={from || undefined} />
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
                {/* §W24: purani CaseHeaderStrip hata di — wahi info (case #,
                    naam, category, status, Board #) command bar + status header
                    mein pehle se thi, teen jagah repeat ho rahi thi. Roll/Reg/
                    Online-Verification # ab command bar ke chips mein hain. */}
                <CaseCommandBar
                  detail={detail}
                  admin={admin}
                  onUpdated={setDetail}
                  onMessage={setMessage}
                  backHref={backHref}
                  backLabel={backLabel}
                />
                <CaseStatusHeader
                  detail={detail}
                  admin={admin}
                  onChanged={reload}
                  onMessage={setMessage}
                  hideComplete={isDeptWorkerAccess(admin.role, admin.permissions)}
                />
                <CaseWarningStrip
                  detail={detail}
                  pendingReasons={pendingReasons}
                  onOpenTab={isDeptWorkerAccess(admin.role, admin.permissions) ? scrollToSection : openTab}
                  remarksOpen={!isDeptWorkerAccess(admin.role, admin.permissions) && activeTab === "remarks"}
                />

                {/* §W36: printing / attestation / courier worker — tabs ki bajaye
                    ek hi page (sections); Payments tab nahi, History/Finance mein
                    se sirf apna commission. */}
                {isDeptWorkerAccess(admin.role, admin.permissions) ? (
                  <DeptWorkerCaseSections
                    detail={detail}
                    admin={admin}
                    onUpdated={setDetail}
                    onReload={reload}
                    onMessage={setMessage}
                    pendingReasons={pendingReasons}
                    setPendingReasons={setPendingReasons}
                  />
                ) : (
                <>

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
              </>
            )}
          </div>
        )
      }
    </OfficePageFrame>
    {returning && <ReturnToOriginBanner href={backHref} label={backLabel} onStay={() => setReturning(false)} />}
    </>
  );
}
