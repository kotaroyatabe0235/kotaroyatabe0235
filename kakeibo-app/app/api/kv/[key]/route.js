import { getValue, setValue } from "@/lib/db";

export async function GET(request, { params }) {
  const { key } = await params;
  const value = getValue(key);
  return Response.json({ value });
}

export async function PUT(request, { params }) {
  const { key } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  if (typeof body.value !== "string") {
    return Response.json({ ok: false, error: "value must be a string" }, { status: 400 });
  }
  setValue(key, body.value);
  return Response.json({ ok: true });
}
