import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toJson } from "@/lib/office/serializers";

// ---------------------------------------------------------------------------
// Wave 20 (perf) — office setup / static data rarely changes, but har baar
// fresh DB read ~150-300ms ki extra latency deta hai (Vercel ↔ SG database).
// Ye loaders unstable_cache (60s revalidate) mein wrapped hain; setup
// mutation routes `revalidateOfficeSetup()` call kar ke foran invalidate
// karti hain. Auth guard phir bhi har request par chalta hai — cache sirf
// DB result ki jagah leta hai, permission check ki nahi.
//
// Cached rows PLAIN JSON hain (toJson: Decimal → number, phir JSON round-trip
// se Date → ISO string), is liye API responses byte-identical rehte hain aur
// koi Prisma class instance cache round-trip par depend nahi karta.
// ---------------------------------------------------------------------------

export const OFFICE_SETUP_CACHE_TAG = "office-setup";

export function revalidateOfficeSetup() {
  revalidateTag(OFFICE_SETUP_CACHE_TAG);
}

// Runtime: Prisma rows → plain JSON (Decimal → number via toJson, Date → ISO
// string). Return type explicitly cached-shape hai, is liye call site par
// generic param dete hain.
function plain<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(toJson(value)));
}

export type CachedCategory = {
  id: string;
  name: string;
  defaultAmount: number | null;
  order: number;
  isActive: boolean;
  createdAt: string;
};

export const getOfficeCategories: () => Promise<CachedCategory[]> = unstable_cache(
  async () =>
    plain<CachedCategory[]>(
      await prisma.caseCategory.findMany({
        orderBy: [{ order: "asc" }, { name: "asc" }],
      })
    ),
  ["office-setup-categories"],
  { revalidate: 60, tags: [OFFICE_SETUP_CACHE_TAG] }
);

export type CachedAttestationType = {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
  createdAt: string;
};

export const getOfficeAttestationTypes: () => Promise<CachedAttestationType[]> = unstable_cache(
  async () =>
    plain<CachedAttestationType[]>(
      await prisma.attestationType.findMany({
        orderBy: [{ order: "asc" }, { name: "asc" }],
      })
    ),
  ["office-setup-attestation-types"],
  { revalidate: 60, tags: [OFFICE_SETUP_CACHE_TAG] }
);

export type CachedSetStep = {
  id: string;
  setId: string;
  stepKey: string;
  label: string;
  order: number;
};

export type CachedCategorySet = {
  id: string;
  categoryId: string;
  name: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  steps: CachedSetStep[];
};

// Tamam sets (+ ordered steps) ek hi cache entry mein — table chhoti hai;
// callers categoryId / isActive in-memory filter karte hain (orderBy se
// response order pehle jaisa hi rehta hai).
export const getOfficeCategorySets: () => Promise<CachedCategorySet[]> = unstable_cache(
  async () =>
    plain<CachedCategorySet[]>(
      await prisma.categorySet.findMany({
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: { steps: { orderBy: { order: "asc" } } },
      })
    ),
  ["office-setup-category-sets"],
  { revalidate: 60, tags: [OFFICE_SETUP_CACHE_TAG] }
);

export type CachedDepartmentLink = {
  id: string;
  department: string;
  label: string;
  url: string;
  order: number;
  isActive: boolean;
  createdAt: string;
};

export const getOfficeDepartmentLinks: () => Promise<CachedDepartmentLink[]> = unstable_cache(
  async () =>
    plain<CachedDepartmentLink[]>(
      await prisma.departmentLink.findMany({
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      })
    ),
  ["office-setup-department-links"],
  { revalidate: 60, tags: [OFFICE_SETUP_CACHE_TAG] }
);

export type CachedHolidayClosure = {
  id: string;
  date: string; // ISO (UTC midnight)
  scope: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

export const getOfficeHolidayClosures: () => Promise<CachedHolidayClosure[]> = unstable_cache(
  async () =>
    plain<CachedHolidayClosure[]>(
      await prisma.holidayClosure.findMany({
        orderBy: [{ date: "asc" }, { scope: "asc" }],
      })
    ),
  ["office-setup-holiday-closures"],
  { revalidate: 60, tags: [OFFICE_SETUP_CACHE_TAG] }
);

// Slim office directory (id/name/type/isActive) — mutation routes ke
// validation lookups ke liye (booking-office core fields SIRF
// setup/booking-offices route se badalte hain, jo cache invalidate karta hai).
export type CachedOffice = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
};

export const getOfficeDirectory: () => Promise<CachedOffice[]> = unstable_cache(
  async () =>
    plain<CachedOffice[]>(
      await prisma.bookingOffice.findMany({
        select: { id: true, name: true, type: true, isActive: true },
      })
    ),
  ["office-setup-office-directory"],
  { revalidate: 60, tags: [OFFICE_SETUP_CACHE_TAG] }
);

export async function findCachedOffice(id: string): Promise<CachedOffice | null> {
  const offices = await getOfficeDirectory();
  return offices.find((office) => office.id === id) ?? null;
}
