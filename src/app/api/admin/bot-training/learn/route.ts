import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { runBotLearning } from "@/lib/bot-learning";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    await requirePermission("botTraining:write");
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const rebuild = body.rebuild === true;

    if (!courseId) {
      return NextResponse.json({ error: "Course zaroori hai" }, { status: 400 });
    }

    const result = await runBotLearning(courseId, { rebuild });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bot learning fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
