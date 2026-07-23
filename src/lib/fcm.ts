import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushSendResult = {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
  errors: string[];
};

function loadServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON");
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, "\n");
    return {
      type: "service_account",
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    };
  }
  return null;
}

function getFirebaseApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const sa = loadServiceAccount();
  if (!sa) {
    throw new Error(
      "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).",
    );
  }

  return initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
    projectId: sa.project_id,
  });
}

function getFcm(): Messaging {
  return getMessaging(getFirebaseApp());
}

export function isFcmConfigured(): boolean {
  try {
    return loadServiceAccount() != null;
  } catch {
    return false;
  }
}

/** Send to one or many device tokens (chunks of 500). */
export async function sendPushToTokens(
  tokens: string[],
  payload: PushPayload,
): Promise<PushSendResult> {
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [], errors: ["No tokens"] };
  }

  const messaging = getFcm();
  const invalidTokens: string[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  const data: Record<string, string> = {};
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      data[k] = String(v);
    }
  }

  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: Object.keys(data).length ? data : undefined,
      android: {
        priority: "high",
        notification: {
          channelId: "gymhub_default",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });

    successCount += res.successCount;
    failureCount += res.failureCount;

    res.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = r.error?.code ?? "";
      const token = chunk[idx];
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("mismatched-credential")
      ) {
        invalidTokens.push(token);
      }
      if (r.error?.message) errors.push(r.error.message);
    });
  }

  return { successCount, failureCount, invalidTokens, errors: errors.slice(0, 10) };
}

/** Notify a single user by profile id (reads fcm_token). */
export async function sendPushToUserId(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  const { data, error } = await supabase
    .from("profiles")
    .select("fcm_token")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return {
      successCount: 0,
      failureCount: 1,
      invalidTokens: [],
      errors: [error.message],
    };
  }

  const token = (data?.fcm_token as string | null)?.trim();
  if (!token) {
    return {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      errors: ["User has no fcm_token"],
    };
  }

  const result = await sendPushToTokens([token], payload);
  if (result.invalidTokens.length) {
    await supabase
      .from("profiles")
      .update({ fcm_token: null })
      .eq("id", userId)
      .eq("fcm_token", token);
  }
  return result;
}
