import { createClient } from "@supabase/supabase-js";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") return json(405, { error: "Use POST." });
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json(400, { error: "Send a valid JSON object." }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Send a valid JSON object." });
  const { email, password, username, family_name, first_name, middle_initial } = body as {
    email: string; password: string; username: string; family_name?: string; first_name?: string; middle_initial?: string | null;
  };
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254
    || typeof password !== "string" || password.length < 6 || password.length > 1024
    || typeof username !== "string" || !username.trim() || username.length > 100
    || [family_name, first_name, middle_initial].some(value => value != null && (typeof value !== "string" || value.length > 100))) {
    return json(400, { error: "Provide a valid email, password (at least 6 characters), username, and names." });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Whitelist check against report_allowed_users
  const { data: allowed } = await supabaseAdmin
    .from("report_allowed_users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!allowed) {
    return json(403, {
      error:
        "This email is not approved for registration. Contact your administrator.",
    });
  }

  // 2. Prevent duplicate profile (username taken)
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", username.trim())
    .maybeSingle();

  if (existingProfile) {
    return json(409, { error: "Username is already taken." });
  }

  // 3. Check if email already exists in auth.users (shared with another app)
  let existingAuthUser: { id: string; email?: string } | undefined;
  for (let page = 1; ; page++) {
    const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) return json(500, { error: "Could not verify user registry." });
    existingAuthUser = listData.users.find((user: { email?: string }) => user.email?.toLowerCase() === normalizedEmail);
    if (existingAuthUser || listData.users.length < 1000) break;
  }
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let authUserId: string;

  if (existingAuthUser) {
    // Owning an allowed email address alone is not proof of account ownership.
    const { data: signedIn, error: signInErr } = await authClient.auth.signInWithPassword({ email: normalizedEmail, password });
    if (signInErr || signedIn.user?.id !== existingAuthUser.id) {
      return json(403, { error: "Use the existing account password before registering this app." });
    }
    authUserId = existingAuthUser.id;
  } else {
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true });
    if (createErr || !newUser.user) return json(400, { error: createErr?.message || "Could not create account." });
    authUserId = newUser.user.id;
  }

  // 4. Insert per-app profile into profiles table
  const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
    id: authUserId,
    email: normalizedEmail,
    username: username.trim(),
    family_name: family_name?.trim() || "",
    first_name: first_name?.trim() || "",
    middle_initial: middle_initial?.trim() || null,
    app_source: "report",
  });

  if (profileErr) {
    return json(500, { error: profileErr.message });
  }

  return json(200, { success: true });
});
