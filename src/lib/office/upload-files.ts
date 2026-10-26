"use client";

import { announceOfficeChange } from "@/lib/office/live";

// §W26 — department files (printing proof, attestation step/FINAL, filing,
// courier slip) ka client uploader. Ek ya KAI files.
//
// Masla (pehle): har file multipart ban kar Vercel function se guzarti thi.
// Vercel function ki request body 4.5 MB se zyada ho to request wahin rok di
// jati hai (video, scanned PDF, phone ki kai photos) — browser ko aksar
// "connection reset" milta tha, fetch throw karta tha aur upload button
// hamesha spinner par atka rehta tha (page "corrupt").
//
// Ab: (1) /files/upload-url se har file ka signed PUT URL, (2) browser file ko
// SEEDHA R2 par bhejta hai (progress ke saath, bytes jaise hain waise), (3)
// POST /files (JSON) se rows register. Agar R2 bucket par CORS set na ho to
// direct PUT fail hota hai — tab 4 MB tak ki files purane server raaste se
// chali jati hain; is se badi file par saaf error. Ye function KABHI throw
// nahi karta.

export type UploadItemStatus = "waiting" | "uploading" | "saving" | "done" | "error";

export type UploadItemState = {
  name: string;
  size: number;
  loaded: number;
  status: UploadItemStatus;
  error?: string;
};

export type UploadResult = {
  saved: number;
  failed: number;
  // Server ka case status (workflow aage barha ho to naya) — kuch save na ho to null.
  status: string | null;
  // Fail files ke index (retry ke liye list mein rakhne ko).
  failedIndexes: number[];
  error: string | null;
};

const MB = 1024 * 1024;
export const CASE_FILE_MAX_BYTES = 10 * MB;
export const CASE_VIDEO_MAX_BYTES = 100 * MB;
// Vercel function body limit 4.5 MB (multipart overhead ke liye margin).
const PROXY_MAX_BYTES = 4 * MB;
export const CASE_FILES_MAX_COUNT = 20;
const PARALLEL_UPLOADS = 3;

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i;

export function isVideoFile(file: File) {
  return file.type.startsWith("video/") || VIDEO_EXT.test(file.name);
}

export function formatFileSize(bytes: number) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Client-side pehli jaanch (server phir bhi khud check karta hai).
export function validateCaseFiles(files: File[]): string | null {
  if (files.length === 0) return "Pehle file select karein";
  if (files.length > CASE_FILES_MAX_COUNT) return `Ek dafa mein zyada se zyada ${CASE_FILES_MAX_COUNT} files`;
  for (const file of files) {
    if (file.size === 0) return `"${file.name}" khali file hai`;
    const video = isVideoFile(file);
    if (file.size > (video ? CASE_VIDEO_MAX_BYTES : CASE_FILE_MAX_BYTES)) {
      return video
        ? `"${file.name}" — video 100 MB se badi nahi ho sakti`
        : `"${file.name}" — file 10 MB se badi nahi ho sakti`;
    }
  }
  return null;
}

type XhrResult = { network: true } | { network: false; status: number; text: string };

// fetch upload progress nahi deta — XHR. Network/CORS failure → { network: true }.
function xhrSend(
  method: "PUT" | "POST",
  url: string,
  body: Blob | FormData,
  headers: Record<string, string>,
  onProgress?: (loaded: number) => void
): Promise<XhrResult> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      if (onProgress) xhr.upload.onprogress = (event) => onProgress(event.loaded);
      xhr.onload = () => resolve({ network: false, status: xhr.status, text: xhr.responseText || "" });
      xhr.onerror = () => resolve({ network: true });
      xhr.onabort = () => resolve({ network: true });
      xhr.ontimeout = () => resolve({ network: true });
      xhr.send(body);
    } catch {
      resolve({ network: true });
    }
  });
}

function errorFromText(text: string, status: number) {
  try {
    const data = JSON.parse(text);
    if (data && typeof data.error === "string" && data.error) return data.error as string;
  } catch {
    // non-JSON (maslan Vercel ka 413 page)
  }
  if (status === 413) return "File server ki limit se badi hai";
  return `Request fail (${status})`;
}

async function postJson<T>(
  url: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, error: errorFromText(text, res.status), status: res.status };
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, error: "Server ka jawab samajh nahi aaya", status: res.status };
    }
  } catch {
    return { ok: false, error: "Internet / server se rabta nahi ho saka — dobara koshish karein", status: null };
  }
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// §W37 — R2 bucket par CORS na ho to browser ka direct PUT nahi chalta aur
// sirf 4 MB tak ki files server raaste se jati hain. Phone ki photos aksar is
// se bari hoti hain: unhein browser mein hi JPEG (lambi side max 3000 px) bana
// kar server limit ke andar laate hain. Direct upload chale to asal file hi
// jati hai (ye sirf fallback raaste par). HEIC waghera jo browser decode na kar
// sake → null (phir saaf error).
const SHRINKABLE_IMAGE = /^image\/(jpeg|jpg|png|webp)$/i;

async function shrinkImageForServer(file: File, maxBytes: number): Promise<File | null> {
  if (!SHRINKABLE_IMAGE.test(file.type) || typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    for (const maxSide of [3000, 2400, 1800, 1400]) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return null;
      // PNG ki transparency JPEG mein kaali na ho.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.72]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= maxBytes) {
          const base = file.name.replace(/\.[^./\\]+$/, "") || "image";
          return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
        }
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

// §W37 — upload kis stage par atki (server par audit log mein jati hai).
type UploadStage = "presign" | "put" | "register" | "server" | "too-big" | "network";
type UploadReportItem = {
  name: string;
  size: number;
  type: string;
  stage: UploadStage;
  status: number | null;
  error: string;
  recovered: boolean;
};

// Fire-and-forget: report fail ho to bhi upload ka nateeja wahi rehta hai.
function reportUploadProblems(payload: {
  caseId: string;
  department: string;
  corsReady: boolean | null;
  items: UploadReportItem[];
}) {
  if (payload.items.length === 0) return;
  try {
    void fetch("/api/office/upload-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // report sirf tashkhees ke liye hai
  }
}

type Presigned = { index: number; key: string; contentType: string; uploadUrl: string };

export async function uploadCaseFiles(options: {
  caseId: string;
  department: "FILING" | "PRINTING" | "ATTESTATION" | "COURIER";
  stepKey?: string | null;
  title?: string | null;
  files: File[];
  onProgress?: (items: UploadItemState[]) => void;
}): Promise<UploadResult> {
  const { caseId, department, files, onProgress } = options;
  const stepKey = options.stepKey?.trim() || null;
  const title = options.title?.trim() || null;
  const total = files.length;
  const items: UploadItemState[] = files.map((file) => ({
    name: file.name,
    size: file.size,
    loaded: 0,
    status: "waiting",
  }));
  const report: UploadReportItem[] = [];
  const note = (index: number, stage: UploadStage, error: string, status: number | null, recovered = false) => {
    const file = files[index];
    report.push({ name: file.name, size: file.size, type: file.type, stage, status, error, recovered });
  };
  const emit = () => onProgress?.(items.map((item) => ({ ...item })));
  const fail = (index: number, error: string, stage: UploadStage, status: number | null = null) => {
    items[index].status = "error";
    items[index].error = error;
    note(index, stage, error, status);
    emit();
  };
  const fileTitle = (index: number) => (title ? (total > 1 ? `${title} (${index + 1}/${total})` : title) : null);

  const invalid = validateCaseFiles(files);
  if (invalid) {
    return { saved: 0, failed: total, status: null, failedIndexes: files.map((_, i) => i), error: invalid };
  }
  emit();

  let caseStatus: string | null = null;
  let saved = 0;

  // 1) signed PUT URLs
  const presign = await postJson<{ uploads: Presigned[]; corsReady?: boolean }>(
    `/api/office/cases/${caseId}/files/upload-url`,
    {
      department,
      files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    }
  );
  if (!presign.ok) {
    files.forEach((_, i) => fail(i, presign.error, "presign", presign.status));
    reportUploadProblems({ caseId, department, corsReady: null, items: report });
    return { saved: 0, failed: total, status: null, failedIndexes: files.map((_, i) => i), error: presign.error };
  }
  const corsReady = typeof presign.data.corsReady === "boolean" ? presign.data.corsReady : null;

  // 2) browser → R2 (parallel 3)
  const direct: Array<{ index: number; key: string }> = [];
  // Direct PUT fail (CORS / network / R2 ka inkaar) → server raasta; wajah
  // report ke liye yaad (server raaste se bach jaye to "recovered").
  const viaServer: Array<{ index: number; stage: UploadStage; status: number | null; error: string }> = [];
  await runPool(presign.data.uploads, PARALLEL_UPLOADS, async (upload) => {
    const index = upload.index;
    const file = files[index];
    if (!file) return;
    items[index].status = "uploading";
    emit();
    const result = await xhrSend("PUT", upload.uploadUrl, file, { "Content-Type": upload.contentType }, (loaded) => {
      items[index].loaded = loaded;
      emit();
    });
    if (!result.network && result.status >= 200 && result.status < 300) {
      items[index].loaded = file.size;
      items[index].status = "saving";
      direct.push({ index, key: upload.key });
    } else {
      // §W37: pehle sirf network (CORS) par server raasta tha aur R2 ka 4xx/5xx
      // seedha error tha. Ab dono par server raasta (choti ya chhoti ho sakne
      // wali file ke liye).
      items[index].loaded = 0;
      items[index].status = "waiting";
      viaServer.push(
        result.network
          ? { index, stage: "network", status: null, error: "Direct R2 upload nahi chala (CORS / network)" }
          : { index, stage: "put", status: result.status, error: `Storage ne file qubool nahi ki (${result.status})` }
      );
    }
    emit();
  });

  // 3) direct uploads ek call mein register (ek transaction, ek transition)
  if (direct.length > 0) {
    direct.sort((a, b) => a.index - b.index);
    const register = await postJson<{ status: string }>(`/api/office/cases/${caseId}/files`, {
      department,
      stepKey,
      title,
      uploads: direct.map(({ index, key }) => ({ key, title: fileTitle(index) })),
    });
    if (register.ok) {
      saved += direct.length;
      caseStatus = register.data.status || caseStatus;
      for (const { index } of direct) items[index].status = "done";
      emit();
    } else {
      for (const { index } of direct) fail(index, register.error, "register", register.status);
    }
  }

  // 4) fallback: server raasta, ek file per request (Vercel 4.5 MB limit)
  viaServer.sort((a, b) => a.index - b.index);
  for (const attempt of viaServer) {
    const { index } = attempt;
    let file = files[index];
    if (file.size > PROXY_MAX_BYTES) {
      items[index].status = "uploading";
      emit();
      file = (await shrinkImageForServer(file, PROXY_MAX_BYTES - 64 * 1024)) ?? file;
    }
    if (file.size > PROXY_MAX_BYTES) {
      fail(
        index,
        attempt.stage === "network"
          ? `${formatFileSize(file.size)} ki file seedha storage par nahi ja saki — R2 bucket par CORS rule nahi laga. 4 MB tak ki files aur photos chal jati hain; bari PDF / video ke liye admin Cloudflare R2 mein CORS rule add kare.`
          : `${formatFileSize(file.size)} ki file storage ne qubool nahi ki (${attempt.status ?? "?"}) — dobara koshish karein`,
        "too-big",
        attempt.status
      );
      continue;
    }
    items[index].status = "uploading";
    emit();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("department", department);
    if (stepKey) fd.append("stepKey", stepKey);
    const ownTitle = fileTitle(index);
    if (ownTitle) fd.append("title", ownTitle);
    const result = await xhrSend("POST", `/api/office/cases/${caseId}/files`, fd, {}, (loaded) => {
      items[index].loaded = Math.min(loaded, file.size);
      emit();
    });
    if (result.network) {
      fail(index, "Internet / server se rabta nahi ho saka — dobara koshish karein", "server");
    } else if (result.status >= 200 && result.status < 300) {
      saved += 1;
      items[index].loaded = items[index].size;
      items[index].status = "done";
      note(index, attempt.stage, attempt.error, attempt.status, true);
      try {
        caseStatus = (JSON.parse(result.text) as { status?: string }).status || caseStatus;
      } catch {
        // status optional hai
      }
      emit();
    } else {
      fail(index, errorFromText(result.text, result.status), "server", result.status);
    }
  }

  if (saved > 0) announceOfficeChange();
  reportUploadProblems({ caseId, department, corsReady, items: report });

  const failedIndexes = items.flatMap((item, i) => (item.status === "done" ? [] : [i]));
  const firstError = items.find((item) => item.status === "error")?.error || null;
  return {
    saved,
    failed: failedIndexes.length,
    status: caseStatus,
    failedIndexes,
    error:
      failedIndexes.length === 0
        ? null
        : failedIndexes.length === 1
          ? `"${items[failedIndexes[0]].name}": ${firstError || "upload nahi ho saki"}`
          : `${failedIndexes.length} files upload nahi huin — ${firstError || "dobara koshish karein"}`,
  };
}
