import { AppState } from "./types";
import { createDefaultState, sanitizeDashes } from "./engine";

const STORAGE_KEY = "jscc_command_center_state_v1";

function sanitizeObjectStrings<T>(val: T): T {
  if (typeof val === "string") {
    return sanitizeDashes(val) as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeObjectStrings) as unknown as T;
  }
  if (val && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = sanitizeObjectStrings(v);
    }
    return out as T;
  }
  return val;
}

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    const defaults = createDefaultState();
    return sanitizeObjectStrings({
      ...defaults,
      ...parsed,
      masterResume: {
        ...defaults.masterResume,
        ...(parsed.masterResume || {}),
        contact: {
          ...defaults.masterResume.contact,
          ...(parsed.masterResume?.contact || {}),
          links: Array.isArray(parsed.masterResume?.contact?.links)
            ? parsed.masterResume.contact.links
            : [],
        },
        targetJobTitles: Array.isArray(parsed.masterResume?.targetJobTitles)
          ? parsed.masterResume.targetJobTitles
          : [],
        experience: Array.isArray(parsed.masterResume?.experience)
          ? parsed.masterResume.experience.map((e: Record<string, unknown>, idx: number) => ({
              id: typeof e.id === "string" && e.id ? e.id : `exp_${idx}`,
              company: typeof e.company === "string" ? e.company : "",
              role: typeof e.role === "string" ? e.role : "",
              location: typeof e.location === "string" ? e.location : "",
              startDate: typeof e.startDate === "string" ? e.startDate : "",
              endDate: typeof e.endDate === "string" ? e.endDate : "",
              bullets: Array.isArray(e.bullets) ? e.bullets.map(String) : [""],
              rawBrainstorm: typeof e.rawBrainstorm === "string" ? e.rawBrainstorm : "",
              isConfidentialNda: Boolean(e.isConfidentialNda),
              isClearanceRestricted: Boolean(e.isClearanceRestricted),
              roleSecurityClearance:
                typeof e.roleSecurityClearance === "string" ? e.roleSecurityClearance : "",
              confidentialityNote:
                typeof e.confidentialityNote === "string" ? e.confidentialityNote : "",
              includeComplianceTag:
                typeof e.includeComplianceTag === "boolean" ? e.includeComplianceTag : true,
            }))
          : [],
        projects: Array.isArray(parsed.masterResume?.projects)
          ? parsed.masterResume.projects
          : [],
        education: Array.isArray(parsed.masterResume?.education)
          ? parsed.masterResume.education
          : [],
        skills: Array.isArray(parsed.masterResume?.skills)
          ? parsed.masterResume.skills
          : [],
        skillWeights:
          parsed.masterResume?.skillWeights &&
          typeof parsed.masterResume.skillWeights === "object"
            ? Object.fromEntries(
                Object.entries(
                  parsed.masterResume.skillWeights as Record<string, unknown>
                ).map(([k, v]) => {
                  const n = Math.round(Number(v) || 3);
                  const clamped = Math.min(5, Math.max(1, n)) as
                    | 1
                    | 2
                    | 3
                    | 4
                    | 5;
                  return [k.trim().toLowerCase(), clamped];
                })
              )
            : {},
        skillNotes:
          parsed.masterResume?.skillNotes &&
          typeof parsed.masterResume.skillNotes === "object"
            ? Object.fromEntries(
                Object.entries(
                  parsed.masterResume.skillNotes as Record<string, unknown>
                )
                  .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
                  .map(([k, v]) => [k.trim().toLowerCase(), String(v)])
              )
            : {},
        includeWeightOneOnResume:
          typeof parsed.masterResume?.includeWeightOneOnResume === "boolean"
            ? parsed.masterResume.includeWeightOneOnResume
            : true,
        atsKeywords: Array.isArray(parsed.masterResume?.atsKeywords)
          ? parsed.masterResume.atsKeywords
          : [],
        aiUsage: Array.isArray(parsed.masterResume?.aiUsage)
          ? parsed.masterResume.aiUsage
          : [],
        certifications: Array.isArray(parsed.masterResume?.certifications)
          ? parsed.masterResume.certifications
          : [],
        accomplishments: Array.isArray(parsed.masterResume?.accomplishments)
          ? parsed.masterResume.accomplishments
          : [],
      },
      applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      interviews: Array.isArray(parsed.interviews) ? parsed.interviews : [],
      tailoredByApp:
        parsed.tailoredByApp && typeof parsed.tailoredByApp === "object"
          ? parsed.tailoredByApp
          : {},
      savedBoards: Array.isArray(parsed.savedBoards)
        ? parsed.savedBoards
        : defaults.savedBoards,
      activityLog: Array.isArray(parsed.activityLog) ? parsed.activityLog : [],
      retentionDays:
        typeof parsed.retentionDays === "number" && parsed.retentionDays >= 0
          ? parsed.retentionDays
          : 0,
    });
  } catch {
    return createDefaultState();
  }
}

export function pruneActivityLogByRetention<
  T extends { timestamp: string }
>(entries: T[], retentionDays: number): T[] {
  const capped = entries.slice(0, 500);
  if (!retentionDays || retentionDays <= 0) {
    return capped;
  }
  const cutoffMs = Date.now() - retentionDays * 86400 * 1000;
  return capped.filter((item) => {
    const t = Date.parse(item.timestamp);
    return Number.isNaN(t) ? true : t >= cutoffMs;
  });
}

export function saveAppState(state: AppState): AppState {
  const retention =
    typeof state.retentionDays === "number" && state.retentionDays >= 0
      ? state.retentionDays
      : 0;
  const prunedState: AppState = {
    ...state,
    retentionDays: retention,
    activityLog: pruneActivityLogByRetention(
      state.activityLog || [],
      retention
    ),
  };
  const clean = sanitizeObjectStrings(prunedState);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Graceful local storage boundary handling
  }
  return clean;
}

export function clearLocalStorageState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

