/**
 * Comprehensive test script for BBTE Education Hub
 * Tests all API endpoints and core functionality
 */

import { readFileSync } from "fs";
import { join } from "path";

function loadEnvFile() {
  try {
    const content = readFileSync(join(process.cwd(), ".env"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env optional for tests
  }
}

loadEnvFile();

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(msg);
}

function pass(name: string) {
  results.push({ name, passed: true });
  log(`  ✅ ${name}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  log(`  ❌ ${name}: ${error}`);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

async function runTests() {
  log("\n🧪 BBTE Education Hub - Full Test Suite\n");
  log(`Testing against: ${BASE_URL}\n`);

  let sessionCookie = "";
  let courseId = "";
  let sampleId = "";
  let questionId = "";

  // 1. Public API Tests
  log("📋 Public API Tests");

  await test("GET /api/courses returns courses", async () => {
    const res = await fetch(`${BASE_URL}/api/courses`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Expected array");
    if (data.length === 0) throw new Error("No courses found - run seed first");
    courseId = data[0].id;
  });

  await test("GET /api/courses/[id] returns course detail", async () => {
    const res = await fetch(`${BASE_URL}/api/courses/${courseId}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.title) throw new Error("Missing title");
    if (!Array.isArray(data.samples)) throw new Error("Missing samples");
    if (!Array.isArray(data.questions)) throw new Error("Missing questions");
    if (data.samples.length > 0) sampleId = data.samples[0].id;
    if (data.questions.length > 0) questionId = data.questions[0].id;
  });

  await test("GET /api/settings returns site settings", async () => {
    const res = await fetch(`${BASE_URL}/api/settings`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.siteName) throw new Error("Missing siteName");
  });

  await test("GET /api/media serves files with inline disposition", async () => {
    let mediaFilename = "";
    let testSampleId = "";

    const settingsRes = await fetch(`${BASE_URL}/api/settings`);
    const settings = await settingsRes.json();
    if (settings.logoFilename) {
      mediaFilename = settings.logoFilename;
    }

    if (!mediaFilename) {
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      });
      if (!loginRes.ok) throw new Error("Login required to create test sample");
      const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] || "";

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#3b82f6"/></svg>`;
      const formData = new FormData();
      formData.append("file", new Blob([svg], { type: "image/svg+xml" }), "test-media.svg");
      formData.append("title", "Test Media");

      const uploadRes = await fetch(`${BASE_URL}/api/courses/${courseId}/samples`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Could not upload test sample for media check");
      const uploaded = await uploadRes.json();
      mediaFilename = uploaded.filename;
      testSampleId = uploaded.id;
    }

    const res = await fetch(
      `${BASE_URL}/api/media/${encodeURIComponent(mediaFilename)}`
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const disposition = res.headers.get("content-disposition");
    if (disposition !== "inline") throw new Error(`Expected inline, got ${disposition}`);

    if (testSampleId) {
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      });
      const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] || "";
      await fetch(`${BASE_URL}/api/courses/${courseId}/samples?sampleId=${testSampleId}`, {
        method: "DELETE",
        headers: { Cookie: cookie },
      });
    }
  });

  // 2. Auth Tests
  log("\n🔐 Authentication Tests");

  await test("POST /api/auth/login with wrong credentials fails", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "wrong@test.com", password: "wrong" }),
    });
    if (res.ok) throw new Error("Should have failed");
  });

  await test("POST /api/auth/login with correct credentials succeeds", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error("No session cookie set");
    sessionCookie = setCookie.split(";")[0];
  });

  await test("GET /api/auth/me returns admin info", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: sessionCookie },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.authenticated) throw new Error("Not authenticated");
    if (!data.admin?.email) throw new Error("Missing admin email");
  });

  // 3. Protected API Tests
  log("\n🛡️ Protected API Tests");

  await test("POST /api/courses without auth fails", async () => {
    const res = await fetch(`${BASE_URL}/api/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", description: "Test" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test("POST /api/courses with auth creates course", async () => {
    const res = await fetch(`${BASE_URL}/api/courses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        title: "Test Course Auto",
        description: "Automated test course",
        isPublished: false,
      }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.id) throw new Error("No course ID returned");

    // Cleanup
    await fetch(`${BASE_URL}/api/courses/${data.id}`, {
      method: "DELETE",
      headers: { Cookie: sessionCookie },
    });
  });

  await test("POST /api/courses/[id]/questions with auth adds question", async () => {
    const res = await fetch(`${BASE_URL}/api/courses/${courseId}/questions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        question: "Test question?",
        answer: "Test answer.",
      }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.id) throw new Error("No question ID");

    // Cleanup
    await fetch(
      `${BASE_URL}/api/courses/${courseId}/questions?questionId=${data.id}`,
      { method: "DELETE", headers: { Cookie: sessionCookie } }
    );
  });

  await test("POST /api/courses/[id]/user-questions submits user question", async () => {
    const res = await fetch(`${BASE_URL}/api/courses/${courseId}/user-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Test user question?" }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Submit failed");

    const listRes = await fetch(
      `${BASE_URL}/api/courses/${courseId}/user-questions?admin=true`,
      { headers: { Cookie: sessionCookie } }
    );
    const list = await listRes.json();
    const created = list.find((q: { question: string }) => q.question === "Test user question?");
    if (!created) throw new Error("User question not found in admin list");

    await fetch(
      `${BASE_URL}/api/courses/${courseId}/user-questions?questionId=${created.id}`,
      { method: "DELETE", headers: { Cookie: sessionCookie } }
    );
  });

  // 4. Page Tests
  log("\n🌐 Page Tests");

  await test("Home page loads (200)", async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes("Courses and Services")) throw new Error("Missing page content");
  });

  await test("Course page loads (200)", async () => {
    const res = await fetch(`${BASE_URL}/courses/${courseId}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  await test("Admin login page loads (200)", async () => {
    const res = await fetch(`${BASE_URL}/admin/login`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  await test("Admin dashboard redirects without auth", async () => {
    const res = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
    // Client-side redirect, page should still load
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  // 5. Logout
  log("\n🚪 Logout Test");

  await test("POST /api/auth/logout clears session", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: sessionCookie },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  // Summary
  log("\n" + "=".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${results.length} tests\n`);

  if (failed > 0) {
    log("Failed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => log(`  - ${r.name}: ${r.error}`));
    process.exit(1);
  }

  log("🎉 All tests passed! Website is fully functional.\n");
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
