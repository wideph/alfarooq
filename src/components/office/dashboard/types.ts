// Contract types for GET /api/office/dashboard (wave 16 overview payload).
// Non-admin (booking_office) viewers sirf apni offices dekhte hain; unke liye
// duesTotal = ownDue hota hai (baqi members ki money kabhi nahi aati).

export type OfficeDashboardOffice = {
  id: string;
  name: string;
  type: string;
  memberCount: number;
  casesTotal: number;
  statusCounts: Record<string, number>;
  pendingPaymentsCount: number;
  pendingPaymentsAmount: number;
  receivedTotal: number;
  duesTotal: number;
  ownDue: number;
};

export type OfficeDashboardTotals = {
  offices: number;
  casesTotal: number;
  pendingPaymentsAmount: number;
  receivedTotal: number;
  duesTotal: number;
};

export type OfficeDashboardResponse = {
  ok: true;
  viewer: { isAdmin: boolean };
  offices: OfficeDashboardOffice[];
  totals: OfficeDashboardTotals;
};
