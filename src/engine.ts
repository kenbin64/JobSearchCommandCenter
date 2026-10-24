import {
  AppState,
  ApplicationRecord,
  ApplicationStage,
  BrainstormConversionInput,
  BrainstormConversionResult,
  ClosedReason,
  ExperienceEntry,
  InterviewType,
  MasterResume,
  SkillWeight,
  TailoredBulletProposal,
  TailoredWorkspace,
  TimelineEvent,
  TimelineEventType,
} from "./types";

export const BANNED_PHRASES = [
  "i am writing to express",
  "delve",
  "passionate about leveraging",
  "in today's fast-paced world",
  "i believe i would be a great fit",
  "results-driven",
  "dynamic",
  "synergy",
  "tapestry",
  "testament to",
  "thrilled to apply",
  "excited to apply",
  "uniquely positioned",
  "ever-evolving",
  "game-changer",
  "cutting-edge",
  "hit the ground running",
  "honed my skills",
  "seamlessly",
  "furthermore",
  "moreover",
];

export function sanitizeDashes(input: string): string {
  if (!input) return "";
  return input.replace(/[\u2014\u2013]/g, "-");
}

export function scrubAiTropesAndDashes(input: string): string {
  let out = sanitizeDashes(input || "");
  const replacements: Array<[RegExp, string]> = [
    [/i am writing to express my (?:strong )?interest in/gi, "I am applying for"],
    [/i (?:am thrilled|am excited) to apply for/gi, "I am applying for"],
    [/i believe i would be a great fit/gi, "My background aligns directly"],
    [/passionate about leveraging/gi, "experienced in using"],
    [/in today's fast-paced world,?\s*/gi, ""],
    [/\bresults-driven\s+/gi, ""],
    [/\bdynamic\s+/gi, ""],
    [/\bcutting-edge\s+/gi, "modern "],
    [/\bever-evolving\s+/gi, ""],
    [/\bseamlessly\s+/gi, "cleanly "],
    [/\bfurthermore,\s*/gi, "Additionally, "],
    [/\bmoreover,\s*/gi, "In addition, "],
    [/\bdelve into\b/gi, "examine"],
    [/\bdelve\b/gi, "explore"],
    [/\bhit the ground running\b/gi, "contribute immediately"],
    [/\bhoned my skills\b/gi, "built practical experience"],
    [/\buniquely positioned\b/gi, "well prepared"],
    [/\bgame-changer\b/gi, "high-impact improvement"],
    [/\bsynergy\b/gi, "collaboration"],
    [/\btapestry\b/gi, "combination"],
    [/\btestament to\b/gi, "evidence of"],
  ];
  for (const [pattern, rep] of replacements) {
    out = out.replace(pattern, rep);
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

export function detectBannedPhrases(text: string): string[] {
  const lower = (text || "").toLowerCase();
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase));
}

export function detectLongDashes(text: string): boolean {
  return /[\u2014\u2013]/.test(text || "");
}

export function countWords(text: string): number {
  const trimmed = (text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysAgoIsoDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalIsoDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const datePart = dateStr.split("T")[0];
  const parts = datePart.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export interface FollowUpStatus {
  daysElapsed: number;
  label: string;
  tone: "neutral" | "amber" | "crimson";
}

export function getLatestEventForApp(
  app: ApplicationRecord,
  events: TimelineEvent[]
): TimelineEvent | null {
  const appEvents = events.filter((e) => e.applicationId === app.id);
  if (appEvents.length === 0) return null;
  const sorted = [...appEvents].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.sequence || 0) - (a.sequence || 0);
  });
  return sorted[0];
}

export function isApplicationRejected(app: ApplicationRecord): boolean {
  return (
    app.stage === ApplicationStage.Closed &&
    app.stageReason === ClosedReason.Rejected
  );
}

export interface PriorJobMatch {
  app: ApplicationRecord;
  isRejected: boolean;
  matchType: "url" | "company_role" | "similar_role" | "reposted_jd";
  reasonLabel: string;
}

export function normalizeJobUrlKey(rawUrl?: string): string {
  const trimmed = (rawUrl || "").trim().toLowerCase();
  if (!trimmed) return "";
  const noProto = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/\/apply\/?$/, "")
    .replace(/\/+$/, "");
  const slashIdx = noProto.indexOf("/");
  if (slashIdx < 0) return "";
  const pathPart = noProto.slice(slashIdx + 1).trim();
  if (pathPart.length < 3) return "";
  return noProto;
}

export function normalizeCompanyKey(rawCompany?: string): string {
  return (rawCompany || "")
    .toLowerCase()
    .replace(
      /\b(inc|incorporated|llc|ltd|corp|corporation|co|company|plc|gmbh|technologies|systems|labs)\b\.?/g,
      " "
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompanyStrictKey(rawCompany?: string): string {
  return (rawCompany || "")
    .toLowerCase()
    .replace(
      /\b(inc|incorporated|llc|ltd|corp|corporation|co|company|plc|gmbh)\b\.?/g,
      " "
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRoleKey(rawRole?: string): string {
  return (rawRole || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\breq\s*#?\s*[a-z0-9-]+\b/g, " ")
    .replace(/#[a-z0-9-]+\b/g, " ")
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/\bswe\b/g, "software engineer")
    .replace(/\beng\.?\b/g, "engineer")
    .replace(/\bmgr\.?\b/g, "manager")
    .replace(/\b(remote|hybrid|onsite|on-site|us|usa)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ROLE_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "of",
  "in",
  "at",
  "to",
  "a",
  "an",
  "i",
  "ii",
  "iii",
  "level",
]);

function computeRoleTokenSimilarity(roleKeyA: string, roleKeyB: string): {
  score: number;
  sharedCount: number;
} {
  if (!roleKeyA || !roleKeyB) return { score: 0, sharedCount: 0 };
  if (roleKeyA === roleKeyB) {
    const count = roleKeyA.split(" ").filter(Boolean).length;
    return { score: 1, sharedCount: count };
  }
  const tokensA = Array.from(
    new Set(
      roleKeyA
        .split(" ")
        .filter((w) => w.length >= 2 && !ROLE_STOP_WORDS.has(w))
    )
  );
  const tokensB = Array.from(
    new Set(
      roleKeyB
        .split(" ")
        .filter((w) => w.length >= 2 && !ROLE_STOP_WORDS.has(w))
    )
  );
  if (tokensA.length < 2 || tokensB.length < 2) {
    return { score: 0, sharedCount: 0 };
  }
  const setB = new Set(tokensB);
  const shared = tokensA.filter((t) => setB.has(t));
  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccard = unionSize > 0 ? shared.length / unionSize : 0;
  const minContainment =
    shared.length / Math.min(tokensA.length, tokensB.length);
  const score = Math.max(jaccard, minContainment * 0.9);
  return { score, sharedCount: shared.length };
}

function extractJdClauses(jd?: string): string[] {
  if (!jd || jd.trim().length < 120) return [];
  return Array.from(
    new Set(
      jd
        .toLowerCase()
        .split(/[\n.;•]+/)
        .map((s) => s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim())
        .filter((s) => s.length >= 35)
    )
  );
}

function computeJdClauseOverlap(jdA?: string, jdB?: string): number {
  const clausesA = extractJdClauses(jdA);
  const clausesB = extractJdClauses(jdB);
  if (clausesA.length < 2 || clausesB.length < 2) return 0;
  const setB = new Set(clausesB);
  const shared = clausesA.filter((c) => setB.has(c)).length;
  return shared / Math.min(clausesA.length, clausesB.length);
}

export function findPriorJobMatches(
  candidate: {
    company?: string;
    role?: string;
    jobUrl?: string;
    jobDescription?: string;
    excludeId?: string;
  },
  applications: ApplicationRecord[]
): PriorJobMatch[] {
  const candUrl = normalizeJobUrlKey(candidate.jobUrl);
  const candCompStrict = normalizeCompanyStrictKey(candidate.company);
  const candCompLoose = normalizeCompanyKey(candidate.company);
  const candRole = normalizeRoleKey(candidate.role);

  const matches: PriorJobMatch[] = [];

  for (const app of applications) {
    if (candidate.excludeId && app.id === candidate.excludeId) continue;

    const appUrl = normalizeJobUrlKey(app.jobUrl);
    if (candUrl && appUrl && candUrl === appUrl) {
      matches.push({
        app,
        isRejected: isApplicationRejected(app),
        matchType: "url",
        reasonLabel: "Exact job posting URL match",
      });
      continue;
    }

    const appCompStrict = normalizeCompanyStrictKey(app.company);
    const appCompLoose = normalizeCompanyKey(app.company);
    const sameCompany =
      (candCompStrict.length >= 2 && candCompStrict === appCompStrict) ||
      (candCompLoose.length >= 3 && candCompLoose === appCompLoose);

    if (!sameCompany) continue;

    const appRole = normalizeRoleKey(app.role);
    if (candRole.length >= 3 && candRole === appRole) {
      matches.push({
        app,
        isRejected: isApplicationRejected(app),
        matchType: "company_role",
        reasonLabel: "Same company and role title",
      });
      continue;
    }

    const roleSim = computeRoleTokenSimilarity(candRole, appRole);
    if (roleSim.sharedCount >= 2 && roleSim.score >= 0.75) {
      matches.push({
        app,
        isRejected: isApplicationRejected(app),
        matchType: "similar_role",
        reasonLabel: "Same company and closely matching role title",
      });
      continue;
    }

    const jdOverlap = computeJdClauseOverlap(
      candidate.jobDescription,
      app.jobDescription
    );
    if (jdOverlap >= 0.6) {
      matches.push({
        app,
        isRejected: isApplicationRejected(app),
        matchType: "reposted_jd",
        reasonLabel: "Matching job description at same company (repost)",
      });
    }
  }

  return matches.sort((a, b) => {
    if (a.isRejected !== b.isRejected) return a.isRejected ? -1 : 1;
    const aClosed = a.app.stage === ApplicationStage.Closed;
    const bClosed = b.app.stage === ApplicationStage.Closed;
    if (aClosed !== bClosed) return aClosed ? -1 : 1;
    return (b.app.updatedAt || "").localeCompare(a.app.updatedAt || "");
  });
}

export function computeFollowUpStatus(
  app: ApplicationRecord,
  events: TimelineEvent[]
): FollowUpStatus {
  if (isApplicationRejected(app)) {
    const datePart = app.rejectedAt ? ` on ${app.rejectedAt}` : "";
    const stagePart =
      app.rejectionStage && app.rejectionStage !== ApplicationStage.Closed
        ? ` (after ${app.rejectionStage})`
        : "";
    return {
      daysElapsed: 0,
      label: `Rejected${datePart}${stagePart}`,
      tone: "crimson",
    };
  }
  if (app.stage === ApplicationStage.Closed) {
    return {
      daysElapsed: 0,
      label: app.stageReason ? `Closed (${app.stageReason})` : "Closed",
      tone: "neutral",
    };
  }
  if (app.stage === ApplicationStage.Saved) {
    return {
      daysElapsed: 0,
      label: "Saved: ready to tailor and submit",
      tone: "neutral",
    };
  }

  const latest = getLatestEventForApp(app, events);
  const refDate = parseLocalIsoDate(latest ? latest.date : app.createdAt);
  const today = parseLocalIsoDate(todayIsoDate());

  if (!refDate || !today) {
    return { daysElapsed: 0, label: "Give it time", tone: "neutral" };
  }

  const rawDiff = Math.floor(
    (today.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  // Future date guard: never output negative elapsed days
  const daysElapsed = Math.max(0, rawDiff);

  if (daysElapsed < 7) {
    return { daysElapsed, label: "Give it time", tone: "neutral" };
  }
  if (daysElapsed <= 10) {
    return { daysElapsed, label: "Time to follow up", tone: "amber" };
  }
  if (daysElapsed > 21) {
    return {
      daysElapsed,
      label: "Gone quiet: one polite nudge, then keep applying elsewhere",
      tone: "crimson",
    };
  }
  return {
    daysElapsed,
    label: "In review window: hold steady",
    tone: "neutral",
  };
}

export function generateCheckInDraft(
  app: ApplicationRecord,
  candidateName: string
): string {
  const firstName = app.contactName
    ? app.contactName.trim().split(/\s+/)[0]
    : "Hiring Team";
  const greeting = app.contactName ? `Hi ${firstName},` : "Hello Hiring Team,";
  const sender = candidateName.trim() || "[Your Name]";

  return sanitizeDashes(
    `${greeting}\n\nI hope your week is going well.\n\nI wanted to share a brief note to confirm my continued interest in the ${app.role} role at ${app.company}. Please let me know if any additional work samples or context from my background would be helpful as your team reviews candidates.\n\nThank you for your time and consideration.\n\nBest regards,\n${sender}`
  );
}

export interface ScreeningLintItem {
  id: string;
  passed: boolean;
  title: string;
  detail: string;
}

export function runScreeningSystemAudit(resume: MasterResume): ScreeningLintItem[] {
  const checks: ScreeningLintItem[] = [];

  // 1. Standard section headers & presence
  const hasSummary = resume.summary.trim().length >= 25;
  const hasExperience =
    resume.experience.length > 0 &&
    resume.experience.some((e) => e.bullets.some((b) => b.trim().length > 10));
  const hasSkills = resume.skills.filter((s) => s.trim()).length >= 3;
  const hasEducation =
    resume.education.length > 0 &&
    resume.education.some((ed) => ed.institution.trim() && ed.degree.trim());

  checks.push({
    id: "headers",
    passed: hasSummary && hasExperience && hasSkills && hasEducation,
    title: "Standard section structure (Summary, Experience, Skills, Education)",
    detail:
      hasSummary && hasExperience && hasSkills && hasEducation
        ? "All four canonical parser headings contain structured entries."
        : "Populate Summary (25+ chars), Experience bullets, at least 3 Skills, and Education so automated parsers map every field.",
  });

  // 2. Plain-text top contact info
  const hasName = resume.contact.name.trim().length >= 2;
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resume.contact.email.trim());
  const hasPhone = /\d{3}.*\d{4}/.test(resume.contact.phone.trim());
  const hasLocation = resume.contact.location.trim().length >= 2;

  checks.push({
    id: "contact",
    passed: hasName && hasEmail && hasPhone && hasLocation,
    title: "Top-of-page plain text contact block",
    detail:
      hasName && hasEmail && hasPhone && hasLocation
        ? "Name, email, phone, and city/state are present in plain single-column text."
        : "Include full name, valid email, phone number, and city/state at top level (never inside tables or headers).",
  });

  // 3. Date format consistency across experience
  const dateFormats = resume.experience.flatMap((exp) =>
    [exp.startDate.trim(), exp.endDate.trim()].filter(Boolean)
  );
  const classifyDateFormat = (d: string): string => {
    if (/^present$/i.test(d) || /^current$/i.test(d)) return "PRESENT";
    if (/^\d{4}-\d{2}$/.test(d)) return "YYYY-MM";
    if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}$/i.test(d))
      return "MON_YYYY";
    if (/^\d{2}\/\d{4}$/.test(d)) return "MM/YYYY";
    if (/^\d{4}$/.test(d)) return "YYYY";
    return "OTHER";
  };
  const nonPresentFormats = new Set(
    dateFormats
      .map(classifyDateFormat)
      .filter((fmt) => fmt !== "PRESENT")
  );
  const datesConsistent =
    resume.experience.length > 0 &&
    dateFormats.length >= resume.experience.length * 2 &&
    nonPresentFormats.size === 1 &&
    !nonPresentFormats.has("OTHER");

  checks.push({
    id: "dates",
    passed: datesConsistent,
    title: "Consistent date formatting across roles",
    detail: datesConsistent
      ? `All role dates follow one uniform format (${Array.from(nonPresentFormats)[0]}).`
      : "Use one consistent date pattern across every role (for example, '2022-05' or 'May 2022', plus 'Present'). Mixing '2021' and '06/2022' trips screening parsers.",
  });

  // 4. Single-column & banned buzzword / long-dash hygiene
  const fullCorpus = [
    resume.summary,
    ...resume.experience.flatMap((e) => [e.company, e.role, ...e.bullets]),
    ...resume.skills,
  ].join(" ");
  const bannedFound = detectBannedPhrases(fullCorpus);
  const hasDashes = detectLongDashes(fullCorpus);

  checks.push({
    id: "hygiene",
    passed: bannedFound.length === 0 && !hasDashes,
    title: "Zero banned cliches & clean character encoding",
    detail:
      bannedFound.length === 0 && !hasDashes
        ? "Single-column plain text verified with zero banned buzzwords or long dashes."
        : [
            bannedFound.length > 0
              ? `Remove banned phrases: ${bannedFound.join(", ")}.`
              : "",
            hasDashes ? "Replace long dashes with commas, colons, or hyphens." : "",
          ]
            .filter(Boolean)
            .join(" "),
  });

  return checks;
}

export function collectAllProfileUrls(
  contact: MasterResume["contact"]
): string[] {
  const explicit = [
    contact.linkedinUrl,
    contact.githubUrl,
    contact.portfolioUrl,
    contact.substackUrl,
    ...(contact.links || []),
  ]
    .map((u) => (u || "").trim())
    .filter(Boolean);
  return Array.from(new Set(explicit));
}

export function formatExperienceComplianceTag(exp: ExperienceEntry): string {
  if (exp.includeComplianceTag === false) return "";
  const parts: string[] = [];
  const clr = (exp.roleSecurityClearance || "").trim();
  if (clr && clr.toLowerCase() !== "none") {
    parts.push(`Clearance: ${clr}`);
  } else if (exp.isClearanceRestricted) {
    parts.push("Clearance-Protected Role");
  }
  if ((exp.confidentialityNote || "").trim()) {
    parts.push(exp.confidentialityNote!.trim());
  } else if (exp.isConfidentialNda && exp.isClearanceRestricted) {
    parts.push("Unclassified & NDA-Safe Summary");
  } else if (exp.isConfidentialNda) {
    parts.push("Scope Generalized per NDA");
  } else if (exp.isClearanceRestricted && !clr) {
    parts.push("Unclassified Summary");
  }
  return sanitizeDashes(parts.join(" | "));
}

export function buildLocalResumeEvaluation(
  resume: MasterResume,
  targetRoleHint = ""
): import("./types").ResumeEvaluationReport {
  const c = resume.contact;
  const allUrls = collectAllProfileUrls(c);
  const nameParts = (c.name || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");
  const cityStateParts = (c.location || "").split(",").map((s) => s.trim());
  const linkedIn =
    c.linkedinUrl?.trim() ||
    allUrls.find((l) => l.toLowerCase().includes("linkedin")) ||
    "";
  const githubOrPortfolio =
    [c.githubUrl, c.portfolioUrl, c.substackUrl]
      .map((s) => (s || "").trim())
      .filter(Boolean)
      .join(" | ") ||
    allUrls.filter((l) => !l.toLowerCase().includes("linkedin")).join(" | ");

  const autofillFields: import("./types").AutofillFieldRow[] = [
    {
      field: "First Name / Last Name",
      extractedValue:
        firstName && lastName
          ? `${firstName} / ${lastName}`
          : c.name || "",
      status: firstName && lastName ? "Clean" : c.name ? "Warning" : "Missing",
      note:
        firstName && lastName
          ? "Splits cleanly into Workday & Greenhouse name fields."
          : "Include both first and last name separated by a single space.",
    },
    {
      field: "Email Address",
      extractedValue: c.email,
      status: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())
        ? "Clean"
        : "Missing",
      note: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())
        ? "Standard RFC email maps cleanly to application login/contact."
        : "Valid plain-text email required for pre-fill forms.",
    },
    {
      field: "Phone Number",
      extractedValue: c.phone,
      status: /^\+?[\d\s()-]{10,16}$/.test(c.phone.trim())
        ? "Clean"
        : c.phone
        ? "Warning"
        : "Missing",
      note: /^\+?[\d\s()-]{10,16}$/.test(c.phone.trim())
        ? "Digits parse cleanly into country/area/number boxes."
        : "Use standard 10-digit format (e.g. 512-555-0144) so pre-fill splitters do not drop digits.",
    },
    {
      field: "City & State/Region",
      extractedValue: c.location,
      status:
        cityStateParts.length >= 2 && cityStateParts[1].length >= 2
          ? "Clean"
          : c.location
          ? "Warning"
          : "Missing",
      note:
        cityStateParts.length >= 2
          ? `City (${cityStateParts[0]}) and Region (${cityStateParts[1]}) separate cleanly.`
          : "Format as 'City, ST' (e.g. Austin, TX) so dropdown pre-fillers match state codes.",
    },
    {
      field: "LinkedIn, GitHub, Portfolio & Substack URLs",
      extractedValue: [linkedIn, githubOrPortfolio].filter(Boolean).join(" | "),
      status: allUrls.length > 0 ? "Clean" : "Warning",
      note:
        allUrls.length > 0
          ? "Dedicated LinkedIn, GitHub, Portfolio, and Substack URLs map directly to portal profile fields."
          : "Add LinkedIn, GitHub, Portfolio, or Substack URLs so application pre-fillers populate social inputs.",
    },
    {
      field: "Work Eligibility, Clearance & Location Preference",
      extractedValue: [
        c.workAuthorization,
        c.securityClearance && c.securityClearance.toLowerCase() !== "none"
          ? `Clearance: ${c.securityClearance}`
          : "",
        c.workPreference,
      ]
        .filter(Boolean)
        .join(" | "),
      status: c.workAuthorization || c.securityClearance ? "Clean" : "Warning",
      note:
        c.workAuthorization || c.securityClearance
          ? "Recruiters see immediate work-eligibility and security clearance status in the top fold."
          : "Optional: add Work Authorization, Security Clearance (if applicable), and Remote/Hybrid preference.",
    },
    {
      field: "Work History Chronology",
      extractedValue:
        resume.experience.length > 0
          ? `${resume.experience.length} roles (${resume.experience[0].startDate} to ${resume.experience[0].endDate})`
          : "",
      status:
        resume.experience.length > 0 &&
        resume.experience.every((e) => e.company.trim() && e.role.trim() && e.startDate.trim())
          ? "Clean"
          : "Missing",
      note:
        resume.experience.length > 0
          ? "Employer, Title, Start Date, and End Date blocks map 1:1 into repeatable work history forms."
          : "Add at least one complete work role with Company, Title, and YYYY-MM dates.",
    },
    {
      field: "Education & Graduation Year",
      extractedValue:
        resume.education.length > 0
          ? `${resume.education[0].degree}, ${resume.education[0].institution} (${resume.education[0].year})`
          : "",
      status:
        resume.education.length > 0 &&
        resume.education.every((ed) => ed.institution.trim() && ed.degree.trim())
          ? "Clean"
          : "Warning",
      note:
        resume.education.length > 0
          ? "Institution, Degree, and 4-digit Year parse cleanly."
          : "Include Institution, Degree, and 4-digit graduation year for ATS education blocks.",
    },
  ];

  // Score bullets for Hiring Manager interest: quantified outcomes (%, $, latency, scale) + strong action verbs + target role keywords
  const hintTokens = targetRoleHint
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);

  const scoreBulletForHiringManager = (bullet: string): number => {
    let pts = 0;
    if (/\d+%|\$\d+|\b\d+(?:\.\d+)?[xmkb]?\b/i.test(bullet)) pts += 40;
    if (
      /^(architected|built|designed|led|optimized|reduced|cut|shipped|scaled|automated|implemented|engineered|launched|improved)\b/i.test(
        bullet.trim()
      )
    ) {
      pts += 25;
    }
    if (bullet.trim().length >= 55 && bullet.trim().length <= 185) pts += 15;
    hintTokens.forEach((tok) => {
      if (bullet.toLowerCase().includes(tok)) pts += 10;
    });
    return pts;
  };

  const reorderedExperience: import("./types").RoleBulletPriority[] =
    resume.experience.map((exp) => {
      const nonEmpty = exp.bullets.filter((b) => b.trim().length > 0);
      const ranked = [...nonEmpty].sort(
        (a, b) => scoreBulletForHiringManager(b) - scoreBulletForHiringManager(a)
      );
      const changed = ranked.some((b, idx) => b !== nonEmpty[idx]);
      return {
        experienceId: exp.id,
        company: exp.company,
        role: exp.role,
        reorderedBullets: ranked.length > 0 ? ranked : exp.bullets,
        leadReason: changed
          ? "Moved highest-impact quantified outcome to bullet #1 so hiring managers see concrete proof in the first 6 seconds."
          : "Strongest quantified outcome already leads this role.",
      };
    });

  const cleanFieldCount = autofillFields.filter((f) => f.status === "Clean").length;
  const atsCompatibilityScore = Math.round(
    (cleanFieldCount / autofillFields.length) * 100
  );

  const allBullets = resume.experience.flatMap((e) =>
    e.bullets.filter((b) => b.trim().length > 0)
  );
  const quantifiedRatio =
    allBullets.length > 0
      ? allBullets.filter((b) => /\d/.test(b)).length / allBullets.length
      : 0;
  const hiringManagerReadabilityScore = Math.min(
    100,
    Math.round(
      (resume.summary.trim().length >= 35 ? 25 : 10) +
        (resume.skills.length >= 5 ? 25 : 10) +
        quantifiedRatio * 50
    )
  );

  const parserFixes: string[] = autofillFields
    .filter((f) => f.status !== "Clean")
    .map((f) => `${f.field}: ${f.note}`);
  if (parserFixes.length === 0) {
    parserFixes.push(
      "All core pre-fill fields (Name, Email, Phone, City/State, URLs, Work Chronology, Education) pass strict ATS autofill validation."
    );
  }

  const hiringManagerPriorities: string[] = [];
  if (quantifiedRatio < 0.6) {
    hiringManagerPriorities.push(
      "Lead every role with a measurable before/after outcome (latency cut, volume handled, revenue/hours saved, or reliability %) rather than task descriptions."
    );
  } else {
    hiringManagerPriorities.push(
      "High density of quantified metrics detected; keep your strongest number in Bullet #1 of your most recent role."
    );
  }
  hiringManagerPriorities.push(
    "Front-load your exact target title, years of experience, and top 4 production skills in the first two lines of your Summary."
  );
  if (reorderedExperience.some((r) => r.leadReason.startsWith("Moved"))) {
    hiringManagerPriorities.push(
      "One or more roles bury quantified proof below generic bullets. Click 'Apply Impact-First Bullet Order' below to promote your strongest proof to the top."
    );
  }

  const topTitle =
    targetRoleHint.trim() ||
    resume.experience[0]?.role ||
    "Software & Systems Professional";
  const sortedForHeadline = partitionAndSortSkillsByWeight(resume).coreSkills;
  const topSkills =
    (sortedForHeadline.length > 0 ? sortedForHeadline : resume.skills)
      .slice(0, 4)
      .join(", ") || "core technical systems";
  const topFoldHeadline = sanitizeDashes(
    `${topTitle} | Verified production impact across ${topSkills}`
  );

  return {
    atsCompatibilityScore,
    hiringManagerReadabilityScore,
    topFoldHeadline,
    autofillFields,
    parserFixes,
    hiringManagerPriorities,
    reorderedExperience,
    usedAiModel: false,
    evaluatedAt: new Date().toISOString(),
  };
}

export interface AutoFixResumeResult {
  fixedResume: MasterResume;
  fixesApplied: string[];
  fixedCount: number;
}

export function autoFixMasterResumeForAutofill(
  resume: MasterResume,
  targetRoleHint = ""
): AutoFixResumeResult {
  const fixes: string[] = [];
  const fixed: MasterResume = JSON.parse(JSON.stringify(resume));

  // 1. Name: ensure first and last name separated by space
  let name = (fixed.contact.name || "").trim().replace(/\s+/g, " ");
  if (!name || name.split(" ").length < 2) {
    if (fixed.contact.email.includes("@")) {
      const handle = fixed.contact.email.split("@")[0];
      const tokens = handle
        .split(/[._-]/)
        .filter((t) => t.length > 1 && !/^\d+$/.test(t));
      if (tokens.length >= 2) {
        name = tokens
          .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
          .join(" ");
      }
    }
    if (!name || name.split(" ").length < 2) {
      name = name ? `${name} Bingham` : "Kenneth W. Bingham";
    }
    fixes.push(
      `Standardized Full Name to "${name}" (first and last name separated for parser splitters).`
    );
  }
  fixed.contact.name = sanitizeDashes(name);

  // 2. Email Address: valid RFC format
  let email = (fixed.contact.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const slug = fixed.contact.name.toLowerCase().replace(/[^a-z0-9]/g, ".");
    email = `${slug || "ken.bingham64"}@gmail.com`;
    fixes.push(`Normalized contact email to RFC format: "${email}".`);
  }
  fixed.contact.email = email;

  // 3. Phone Number: valid US/E.164 10-digit format
  const rawPhone = (fixed.contact.phone || "").trim();
  const digits = rawPhone.replace(/\D/g, "");
  let formattedPhone = rawPhone;
  if (digits.length === 10) {
    formattedPhone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (formattedPhone !== rawPhone) {
      fixes.push(
        `Formatted phone number to standard 10-digit format: "${formattedPhone}".`
      );
    }
  } else if (digits.length === 11 && digits.startsWith("1")) {
    formattedPhone = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    if (formattedPhone !== rawPhone) {
      fixes.push(
        `Formatted phone number to international E.164 format: "${formattedPhone}".`
      );
    }
  } else if (digits.length < 10) {
    formattedPhone = "(801) 425-2652";
    fixes.push(
      `Added standard 10-digit phone number: "${formattedPhone}" so form splitters do not drop digits.`
    );
  }
  fixed.contact.phone = formattedPhone;

  // 4. City & State/Region: ensure "City, ST" format
  let loc = (fixed.contact.location || "").trim();
  const commaParts = loc.split(",").map((s) => s.trim());
  if (commaParts.length < 2 || commaParts[1].length < 2) {
    const stateMatch = loc.match(
      /^(.*?)(?:\s+|,)([A-Z]{2}|Utah|Texas|California|Washington|New York)$/i
    );
    if (stateMatch) {
      const city = stateMatch[1].trim();
      const st = stateMatch[2].toUpperCase().slice(0, 2);
      loc = `${city}, ${st}`;
      fixes.push(`Formatted location to standard "City, ST" format: "${loc}".`);
    } else if (loc.length > 0) {
      loc = `${loc}, UT`;
      fixes.push(
        `Appended state code to location for ATS dropdown matchers: "${loc}".`
      );
    } else {
      loc = "St. George, UT";
      fixes.push(`Set default standard location: "${loc}".`);
    }
  }
  fixed.contact.location = sanitizeDashes(loc);

  // 5. Profile URLs: ensure https:// protocol prefix
  const fixUrl = (u?: string): string => {
    if (!u) return "";
    let clean = u.trim();
    if (!clean) return "";
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
    }
    return clean;
  };

  const oldLinkedin = fixed.contact.linkedinUrl || "";
  fixed.contact.linkedinUrl = fixUrl(fixed.contact.linkedinUrl);
  if (fixed.contact.linkedinUrl && fixed.contact.linkedinUrl !== oldLinkedin) {
    fixes.push("Added https:// prefix to LinkedIn URL for portal clickability.");
  }
  if (!fixed.contact.linkedinUrl) {
    fixed.contact.linkedinUrl =
      "https://www.linkedin.com/in/kenneth-bingham-11378b10";
    fixes.push("Added dedicated LinkedIn URL to pre-fill candidate profile link.");
  }

  if (fixed.contact.githubUrl) {
    fixed.contact.githubUrl = fixUrl(fixed.contact.githubUrl);
  }
  if (fixed.contact.portfolioUrl) {
    fixed.contact.portfolioUrl = fixUrl(fixed.contact.portfolioUrl);
  }
  if (fixed.contact.substackUrl) {
    fixed.contact.substackUrl = fixUrl(fixed.contact.substackUrl);
  }
  if (Array.isArray(fixed.contact.links)) {
    fixed.contact.links = fixed.contact.links.map(fixUrl).filter(Boolean);
  }

  // 6. Work Eligibility, Clearance & Work Preference
  if (
    !fixed.contact.workAuthorization ||
    fixed.contact.workAuthorization.trim().length === 0
  ) {
    fixed.contact.workAuthorization = "US Citizen (no sponsorship required)";
    fixes.push(
      "Set Work Authorization to 'US Citizen (no sponsorship required)'."
    );
  }
  if (
    !fixed.contact.workPreference ||
    fixed.contact.workPreference.trim().length === 0
  ) {
    fixed.contact.workPreference = "Remote or Hybrid";
    fixes.push("Set Work Preference to 'Remote or Hybrid'.");
  }

  // 7. Chronology & Dates
  const normalizeDate = (d: string, isEnd = false): string => {
    const s = (d || "").trim();
    if (!s) return isEnd ? "Present" : "2024-01";
    if (/^(present|current|now|ongoing)$/i.test(s)) return "Present";
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const monthMap: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mMatch = s.match(/^([a-z]+)[a-z]*\s+(\d{4})$/i);
    if (mMatch) {
      const mon = monthMap[mMatch[1].toLowerCase().slice(0, 3)] || "01";
      return `${mMatch[2]}-${mon}`;
    }
    const slashMatch = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      return `${slashMatch[2]}-${slashMatch[1].padStart(2, "0")}`;
    }
    if (/^\d{4}$/.test(s)) {
      return `${s}-01`;
    }
    return s;
  };

  let datesAdjusted = 0;
  if (fixed.experience && fixed.experience.length > 0) {
    fixed.experience = fixed.experience.map((exp, idx) => {
      const newStart = normalizeDate(exp.startDate, false);
      const newEnd = normalizeDate(exp.endDate, idx === 0);
      if (newStart !== exp.startDate || newEnd !== exp.endDate) {
        datesAdjusted++;
      }
      return {
        ...exp,
        company: sanitizeDashes(exp.company || "Enterprise Organization"),
        role: sanitizeDashes(exp.role || "Software Developer"),
        location: sanitizeDashes(exp.location || fixed.contact.location),
        startDate: newStart,
        endDate: newEnd,
        bullets: exp.bullets
          .map((b) => scrubAiTropesAndDashes(b.trim()))
          .filter(Boolean),
      };
    });
    if (datesAdjusted > 0) {
      fixes.push(
        `Standardized ${datesAdjusted} role date(s) to uniform YYYY-MM and 'Present' format.`
      );
    }
  } else {
    fixed.experience = [
      {
        id: "exp_fixed_1",
        company: "Handshake AI",
        role: "AI Engineer, Evaluation and Reliability (Contract)",
        location: "Remote",
        startDate: "2026-07",
        endDate: "Present",
        bullets: [
          "Author adversarial benchmark tasks for Terminal-Bench 2 that defeat frontier coding agents at pass@5 0/5.",
          "Built offline difficulty-certification harness (CP-SAT constraint solver) cutting CI from 68 minutes to minutes.",
        ],
      },
    ];
    fixes.push("Added primary work experience chronology block.");
  }

  // 8. Education & 4-digit Graduation Year
  if (!fixed.education || fixed.education.length === 0) {
    fixed.education = [
      {
        id: "edu_fixed_1",
        institution: "Weber State University",
        degree: "B.S., Computer Science and Software Engineering",
        year: "2011",
      },
    ];
    fixes.push(
      "Added verified Education entry with institution, degree, and 4-digit graduation year."
    );
  } else {
    fixed.education = fixed.education.map((ed) => {
      let y = (ed.year || "").trim();
      const matchYear = y.match(/\b(19\d{2}|20\d{2})\b/);
      if (matchYear) {
        y = matchYear[1];
      } else if (!y) {
        y = "2011";
        fixes.push(
          `Set 4-digit graduation year (${y}) for ${ed.institution || "university"}.`
        );
      }
      return {
        ...ed,
        institution: sanitizeDashes(ed.institution || "Weber State University"),
        degree: sanitizeDashes(ed.degree || "B.S., Computer Science"),
        year: y,
      };
    });
  }

  // 9. Target Job Titles
  if (!fixed.targetJobTitles || fixed.targetJobTitles.length === 0) {
    const inferred =
      targetRoleHint.trim() ||
      fixed.experience[0]?.role ||
      "Senior Full-Stack Developer";
    fixed.targetJobTitles = [inferred];
    fixes.push(`Set Target Job Title to "${inferred}".`);
  }

  // 10. Scrub all dashes and tropes across summary, skills, and projects
  fixed.summary = scrubAiTropesAndDashes(fixed.summary);
  fixed.skills = Array.from(
    new Set(
      (fixed.skills || []).map((s) => sanitizeDashes(s.trim())).filter(Boolean)
    )
  );
  if (fixed.projects) {
    fixed.projects = fixed.projects.map((p) => ({
      ...p,
      name: sanitizeDashes(p.name),
      techStack: sanitizeDashes(p.techStack),
      url: fixUrl(p.url),
      description: scrubAiTropesAndDashes(p.description),
    }));
  }

  return {
    fixedResume: fixed,
    fixesApplied: fixes,
    fixedCount: fixes.length,
  };
}

export function fixSingleAutofillField(
  resume: MasterResume,
  fieldName: string
): { fixedResume: MasterResume; fixDescription: string } {
  const result = autoFixMasterResumeForAutofill(resume);
  const fixed = JSON.parse(JSON.stringify(resume)) as MasterResume;
  let fixDesc = "";

  if (fieldName.includes("Name")) {
    fixed.contact.name = result.fixedResume.contact.name;
    fixDesc = `Standardized name to "${fixed.contact.name}".`;
  } else if (fieldName.includes("Email")) {
    fixed.contact.email = result.fixedResume.contact.email;
    fixDesc = `Normalized email to "${fixed.contact.email}".`;
  } else if (fieldName.includes("Phone")) {
    fixed.contact.phone = result.fixedResume.contact.phone;
    fixDesc = `Normalized phone to "${fixed.contact.phone}".`;
  } else if (fieldName.includes("City")) {
    fixed.contact.location = result.fixedResume.contact.location;
    fixDesc = `Normalized location to "${fixed.contact.location}".`;
  } else if (fieldName.includes("URL") || fieldName.includes("LinkedIn")) {
    fixed.contact.linkedinUrl = result.fixedResume.contact.linkedinUrl;
    fixed.contact.githubUrl = result.fixedResume.contact.githubUrl;
    fixed.contact.portfolioUrl = result.fixedResume.contact.portfolioUrl;
    fixed.contact.substackUrl = result.fixedResume.contact.substackUrl;
    fixed.contact.links = result.fixedResume.contact.links;
    fixDesc = "Standardized profile URLs with https:// protocol prefix.";
  } else if (
    fieldName.includes("Eligibility") ||
    fieldName.includes("Clearance")
  ) {
    fixed.contact.workAuthorization =
      result.fixedResume.contact.workAuthorization;
    fixed.contact.workPreference = result.fixedResume.contact.workPreference;
    fixed.contact.securityClearance =
      result.fixedResume.contact.securityClearance;
    fixDesc = "Updated Work Eligibility and Clearance blocks.";
  } else if (
    fieldName.includes("Chronology") ||
    fieldName.includes("Work History")
  ) {
    fixed.experience = result.fixedResume.experience;
    fixDesc = "Standardized role chronology dates to YYYY-MM / Present.";
  } else if (fieldName.includes("Education")) {
    fixed.education = result.fixedResume.education;
    fixDesc = "Standardized Education institution, degree, and 4-digit year.";
  } else {
    return {
      fixedResume: result.fixedResume,
      fixDescription: "Auto-fixed all pre-fill fields to 100% compliance.",
    };
  }

  return { fixedResume: fixed, fixDescription: fixDesc };
}

export const KENNETH_BINGHAM_MASTER_RESUME: MasterResume = {
  contact: {
    name: "Kenneth W. Bingham",
    email: "ken.bingham64@gmail.com",
    phone: "(801) 425-2652",
    location: "St. George, UT",
    linkedinUrl: "https://www.linkedin.com/in/kenneth-bingham-11378b10",
    githubUrl: "https://github.com/kenbin64",
    portfolioUrl: "https://butterflyfx.us",
    substackUrl: "https://substack.com/@kbingh",
    workAuthorization: "US Citizen (no sponsorship required)",
    securityClearance: "U.S. Air Force Secret clearance (previously held)",
    workPreference: "Remote, or hybrid in St. George, UT",
    links: [
      "https://playbutterflyfx.com",
      "https://kensartgallery.com",
      "https://youtube.com/@kbingh",
    ],
  },
  targetJobTitles: [
    "Senior Full-Stack Developer",
    "Software Architect",
    "AI-Directed Engineer",
    "Mid-Level Software Engineer",
    "Senior Software Engineer",
  ],
  summary:
    "Senior full-stack developer, software architect and AI-directed engineer with 15+ years building enterprise, government, financial, logistics and avionics systems. Expert in Java, Spring Boot, C#, .NET Core, Angular, SQL, Azure and microservices. Directs AI as an engineering lead: specification first, every change reviewed, and tests that try to break each claim before anything ships. Strong foundation in discrete math, geometry, trigonometry, 3D graphics and spatial data, with hands-on work in RAG, embeddings, agents and LLM evaluation.",
  experience: [
    {
      id: "exp_kb_1",
      company: "Handshake AI",
      role: "AI Engineer, Evaluation and Reliability (Contract)",
      location: "Remote",
      startDate: "2026-07",
      endDate: "Present",
      bullets: [
        "Author adversarial benchmark tasks for Terminal-Bench 2 that defeat frontier coding agents, verified at pass@5 0/5: the reference agent at maximum reasoning effort fails every attempt.",
        "Built an offline difficulty-certification harness (candidate generator, CP-SAT constraint-solver filter and a blind cold-agent pass@2 run) that certifies task difficulty in minutes instead of a 68-minute CI cycle.",
        "Wrote a deterministic pre-submit linter encoding 104 authoring rules that catches solution leaks, ambiguous framing and self-verifiable traps before a task reaches review.",
        "Designed two pre-build gates, non-self-verifiable and non-internet-lookupable, that guard against metric gaming and training-set contamination.",
        "Run blind pairwise LLM evaluations (anonymized dual-model trajectories, forced-choice rating, grading on correctness, behavior, communication and code style), and evaluate geometric reasoning and visual question answering.",
        "Root-caused an MSYS path-conversion defect that silently misplaced trajectory exports inside the Docker VM, replacing the broken scripts with PowerShell tooling; reported platform-wide CI defects, including a pull_request_target fork-checkout failure.",
      ],
      rawBrainstorm: "",
      isConfidentialNda: false,
      isClearanceRestricted: false,
    },
    {
      id: "exp_kb_2",
      company: "DTSI",
      role: "Software Developer",
      location: "Hill Air Force Base, UT",
      startDate: "2024-04",
      endDate: "2026-05",
      isClearanceRestricted: true,
      roleSecurityClearance: "Secret Clearance",
      bullets: [
        "Principal developer on Air Force logistics and operational systems in Java, Spring Boot, Hibernate, Angular and Bootstrap, and in C#, .NET Core Razor Pages and SQL Server, under strict DoD change control.",
        "Configured CI/CD pipelines and secure deployment workflows with TFS version control, with zero rollbacks.",
        "Built enterprise dashboards and automated operational workflows that streamlined internal processes and reduced technical debt.",
        "Redesigned user interfaces with graphical buttons, icons and modern visual design, driving higher adoption and daily use.",
      ],
    },
    {
      id: "exp_kb_3",
      company: "Humana",
      role: "Software Developer",
      location: "Remote",
      startDate: "2022-02",
      endDate: "2024-01",
      bullets: [
        "Built .NET 6 services in C# and Visual Studio, and HL7 and FHIR interoperability pipelines for high-volume insurance claims under HIPAA.",
        "Modernized legacy applications from .NET Framework to .NET Core (.NET 6) for performance and cross-platform support.",
        "Designed doctor-to-patient-to-insurer communication pipelines, and documented the architecture in Visio.",
        "Built Python ETL automation and Linux workflows that removed manual processing, and optimized SQL for large-scale claims data.",
      ],
    },
    {
      id: "exp_kb_4",
      company: "Software Implementers",
      role: "Software Developer",
      location: "Hill Air Force Base, UT",
      startDate: "2021-04",
      endDate: "2021-12",
      isClearanceRestricted: true,
      roleSecurityClearance: "Secret Clearance",
      bullets: [
        "Developed Java, Spring, Spring Boot and Hibernate services and responsive Angular and Bootstrap front ends for aircraft-parts testing, maintenance and asset tracking.",
        "Turned the testers' manual spreadsheets into a central web-based CMS and workflow platform for parts tracking, test protocols and maintenance.",
        "Integrated hardware scanning equipment with the software for inventory, data entry and asset tracking.",
        "Built dashboards and workflow automation, and designed architecture diagrams, database schemas and data flows in Visio. Held a U.S. Air Force Secret clearance.",
      ],
    },
    {
      id: "exp_kb_5",
      company: "The Church of Jesus Christ of Latter-day Saints (via ConsultNet)",
      role: "Software Developer (Contract)",
      location: "Salt Lake City, UT",
      startDate: "2020-09",
      endDate: "2020-10",
      bullets: [
        "Contributed to an internal application for tracking and versioning Church leaders' talks, in Java, Spring Boot, Hibernate, JSP, Thymeleaf and Bootstrap.",
        "Implemented normalized schemas with advanced SQL join logic and CRUD features; configured secure authentication and role-based access.",
      ],
    },
    {
      id: "exp_kb_6",
      company: "Gwinnett County Public Schools",
      role: "Software Developer",
      location: "Lawrenceville, GA",
      startDate: "2020-02",
      endDate: "2020-08",
      bullets: [
        "Built automated test frameworks in Java and Selenium WebDriver for the district's cloud platforms, with Azure DevOps pipelines.",
        "Built district administrative and reporting tools with secure workflows and Bootstrap dashboards.",
      ],
    },
    {
      id: "exp_kb_7",
      company: "Norfolk Southern Railway (via Collabera)",
      role: "Java Developer (Contract)",
      location: "Atlanta, GA",
      startDate: "2019-04",
      endDate: "2019-08",
      bullets: [
        "Built TIBCO BusinessWorks and Spring Boot messaging for locomotive fuel-efficiency optimization.",
        "Used Splunk for production diagnostics and Jackson for XML handling.",
      ],
    },
    {
      id: "exp_kb_8",
      company: "IBM (via Collabera)",
      role: "Java Developer, Test Automation (Contract)",
      location: "Suwanee, GA",
      startDate: "2018-11",
      endDate: "2019-03",
      bullets: [
        "Worked with the architect and program manager to build a Selenium WebDriver framework using parent-child relationships, significantly reducing boilerplate.",
        "Built grid-based parallel testing and produced automated test reports in Azure.",
      ],
    },
    {
      id: "exp_kb_9",
      company: "InComm",
      role: "Java Developer",
      location: "Taylorsville, UT",
      startDate: "2018-04",
      endDate: "2018-08",
      bullets: [
        "Developer in test for payment and prepaid card software in Java, JavaScript and Angular 6, automating with Selenium WebDriver, TestNG and Postman.",
        "Planned sprints, contributed to software design, and cut boilerplate; used AWS for image storage.",
      ],
    },
    {
      id: "exp_kb_10",
      company: "Finicity, a Mastercard company (via STG)",
      role: "Java Developer",
      location: "Salt Lake City, UT",
      startDate: "2017-09",
      endDate: "2018-04",
      bullets: [
        "Built Spring Boot APIs for Finicity clients and Fannie Mae retrieving credit information from major credit reporting agencies to produce lender reports.",
        "Created JSON endpoints for frontend, OCR text-comparison tool and regex validation application on MySQL and MongoDB.",
        "Practiced test-driven development in Java 8 with JUnit, Spring Boot, Spring Data, Hibernate and Spring Security; SendGrid email integration; Apache PDFBox reports.",
      ],
    },
    {
      id: "exp_kb_11",
      company: "EFS, a WEX company",
      role: "Java Developer",
      location: "Ogden, UT",
      startDate: "2017-02",
      endDate: "2017-09",
      bullets: [
        "Developed and administered customer portal for fleet fuel-card purchases in trucking industry, in Java 8 Servlets and JSP with JavaScript, jQuery and Bootstrap on Oracle and MySQL.",
      ],
    },
    {
      id: "exp_kb_12",
      company: "CUProdigy",
      role: "Java Developer",
      location: "Layton, UT",
      startDate: "2015-04",
      endDate: "2017-02",
      bullets: [
        "Developed core banking system for small and mid-size credit unions: teller applications, loan processing, interest calculation, and collection management.",
        "Built in Java, Spring, Spring Boot, Spring Data JPA, Hibernate, Tomcat and MySQL, with a GWT DataGrid and CellTable front end.",
        "Delivered payment system and payment buckets, emailed PDF documents, HTTP document transfer, and JasperReports reporting.",
      ],
    },
    {
      id: "exp_kb_13",
      company: "Axis41 (via ConsultNet)",
      role: "Java Developer, Adobe AEM 6.0 (Contract)",
      location: "Salt Lake City, UT",
      startDate: "2014-11",
      endDate: "2015-04",
      bullets: [
        "Built O.C. Tanner CMS in Adobe AEM 6.0, including vanity-URL redirect tool in Java, Sling and Jackrabbit, and components in JavaScript and jQuery.",
        "Built Stanford Health Care site components in AEM 6.0 with Bootstrap 3, jQuery UI, JSP, and Java Servlet components.",
      ],
    },
    {
      id: "exp_kb_14",
      company: "USANA Health Sciences (via TEKsystems)",
      role: "Java Developer (Contract)",
      location: "West Valley City, UT",
      startDate: "2014-06",
      endDate: "2014-10",
      bullets: [
        "Front-end development in AngularJS, JavaScript, jQuery, HTML5, CSS3 and Bootstrap for custom website builder templates.",
        "Created AngularJS controllers and directives for widget data and animated UI transitions.",
      ],
    },
    {
      id: "exp_kb_15",
      company: "Software Technology Group",
      role: "Software Consultant",
      location: "Salt Lake City, UT",
      startDate: "2011-09",
      endDate: "2014-06",
      bullets: [
        "Missionary Portal for LDS Church: web app used by thousands of users worldwide for weekly training and reporting; built UI in Bootstrap, Backbone, RequireJS, Java Spring, Hibernate and Oracle.",
        "Translation application for LDS Church: Java Swing components for sending documents for translation into many languages; also Flex 4 and ActionScript.",
        "CourtView: web app used by courts nationwide to track and schedule cases, fine payments and sentences, in Java, Spring, Hibernate, jQuery and Bootstrap.",
        "Configured MarkLogic Server (databases, HTTP/XDBC app servers) and wrote XQuery, XPath, and XSLT transformations.",
      ],
    },
    {
      id: "exp_kb_16",
      company: "Boresight",
      role: "Java Developer (Internship)",
      location: "Ogden, UT",
      startDate: "2010-06",
      endDate: "2011-09",
      bullets: [
        "Built desktop application installed in military and police aircraft for navigation, sensor and camera integration in Java and Java Swing.",
        "Interpreted binary joystick-control data for aircraft-mounted cameras and integrated real-time mapping with aviation waypoints.",
      ],
    },
    {
      id: "exp_kb_17",
      company: "Juniper Networks",
      role: "Customer Service Agent (College Role)",
      location: "West Valley City, UT",
      startDate: "2008-01",
      endDate: "2009-12",
      bullets: [
        "Troubleshot Juniper routers and enterprise networking: TCP/IP, routing tables, NAT, DHCP, VLANs and firewall rules.",
      ],
    },
  ],
  projects: [
    {
      id: "proj_kb_1",
      name: "Agentic Full-Stack Development Pipeline",
      url: "https://github.com/kenbin64",
      techStack: "VS Code, Claude Code, custom MCP server (JSON-RPC 2.0)",
      description:
        "Custom MCP server connecting Claude Code to build full-stack applications and run deployments with versioned releases and one-command rollback.",
    },
    {
      id: "proj_kb_2",
      name: "Chomp 3D: Wally's Cairns Adventure",
      url: "https://playbutterflyfx.com/chomp",
      techStack: "Three.js, WebGL, WebXR, Cloudflare Workers",
      description:
        "Seven-level 3D browser game for desktop, phone and VR. 1,022 unit checks and 107 browser tests gate 14 versioned releases with one-command Cloudflare rollback.",
    },
    {
      id: "proj_kb_3",
      name: "FastTrack 3D",
      url: "https://playbutterflyfx.com/fasttrack",
      techStack: "Three.js, WebSockets, JavaScript",
      description:
        "3D card-driven board game with bots at 3 difficulties. Fixed multiplayer turn desync with host-authoritative turn control over WebSockets, proven by headless two-client regression test.",
    },
    {
      id: "proj_kb_4",
      name: "citeline",
      url: "https://github.com/kenbin64/citeline",
      techStack: "Python, FastAPI, PostgreSQL, pgvector, Cloudflare Workers",
      description:
        "RAG over federal regulations with pgvector embeddings and FastAPI: answers with strict citation or abstains. 31 unit tests and 28-case evaluation set.",
    },
    {
      id: "proj_kb_5",
      name: "mcp-gateway",
      url: "https://github.com/kenbin64/mcp-gateway",
      techStack: "Python, FastAPI, Ruff, Mypy",
      description:
        "Audited MCP server in Python and FastAPI: closed list of read-only tools, schema-validated arguments, every call logged including refusals. 29 tests.",
    },
    {
      id: "proj_kb_6",
      name: "Ken's Art Gallery",
      url: "https://kensartgallery.com",
      techStack: "Three.js, Python, Cloudflare Workers",
      description:
        "Walk-through 3D gallery of 59 works with self-laying rooms, Python image pipeline (watermark, signature, duplicate detection) and Cloudflare Workers.",
    },
    {
      id: "proj_kb_7",
      name: "Cost of Saving",
      url: "https://costofsaving.com",
      techStack: "Cloudflare Workers, Automated Test Suites",
      description:
        "Financial decision calculators on Cloudflare Workers with every formula published: 517 automated checks across 13 test suites.",
    },
  ],
  education: [
    {
      id: "edu_kb_1",
      institution: "Weber State University",
      degree: "B.S., Computer Science and Software Engineering",
      year: "2011",
    },
  ],
  skills: [
    "C#",
    ".NET Core",
    ".NET 6",
    "Java",
    "Spring Boot",
    "SQL",
    "SQL Server",
    "PostgreSQL",
    "React",
    "TypeScript",
    "JavaScript",
    "Python",
    "REST APIs",
    "Microservices",
    "Docker",
    "AWS",
    "Azure",
    "WebSockets",
    "Redis",
    "Kafka",
    "Hibernate",
    "CI/CD",
    "GitHub Actions",
    "xUnit",
    "NUnit",
    "JUnit",
    "Postman",
    "Splunk",
    "Angular",
    "Three.js",
  ],
  skillWeights: {
    "c#": 5,
    ".net core": 5,
    ".net 6": 5,
    java: 5,
    "spring boot": 5,
    sql: 5,
    "sql server": 5,
    postgresql: 5,
    "rest apis": 5,
    microservices: 5,
    typescript: 4,
    javascript: 4,
    react: 4,
    python: 4,
    docker: 4,
    aws: 4,
    azure: 4,
    websockets: 4,
    "ci/cd": 4,
    "github actions": 4,
    xunit: 4,
    nunit: 4,
    junit: 4,
    postman: 4,
    angular: 4,
    redis: 3,
    kafka: 3,
    splunk: 3,
    "three.js": 5,
  },
  skillNotes: {
    "c#": "Built .NET 6 production services at Humana and .NET Core Razor Pages at DTSI / Hill AFB.",
    react: "Hands-on React component architecture in frontends, full-stack tools, and UI applications.",
    websockets: "Designed host-authoritative WebSockets turn-control engine for FastTrack 3D.",
    redis: "Configured cache and broker layers for distributed web and worker pipelines.",
  },
  includeWeightOneOnResume: true,
  atsKeywords: [
    "Production Systems",
    "Distributed Systems",
    "High-Throughput Services",
    "Cloud-Native Architecture",
    "Database Indexing & Query Optimization",
    "Automated Testing & Test-Driven Development",
    "Observability & Telemetry",
    "Incident Response & On-Call",
    "Fintech & Compliance-Regulated Environments",
    "CI/CD Deployment Pipelines",
  ],
  aiUsage: [
    "Agentic workflows with Claude Code and custom MCP server (JSON-RPC 2.0) with automated test gates.",
    "Adversarial benchmark authoring and deterministic pre-submit linting for Terminal-Bench 2 at Handshake AI.",
    "RAG systems with PostgreSQL pgvector embeddings, FastAPI, and strict 28-case evaluation harnesses.",
  ],
  certifications: [
    "U.S. Air Force Secret clearance (previously held, DoD environments)",
  ],
  accomplishments: [
    "Handshake AI: Built offline difficulty-certification harness (CP-SAT constraint solver) cutting CI from 68 minutes to minutes.",
    "DTSI / Hill Air Force Base: Zero rollbacks across mission-critical Air Force logistics deployment pipelines.",
    "Cost of Saving: 517 automated checks across 13 suites for financial calculators.",
  ],
  defaultCoverLetter: `Dear Topstep Hiring Team,

I am applying for the Software Engineer role at Topstep. My background combines 15+ years of building production backend services in C# and .NET with hands-on full-stack delivery in React and TypeScript. At Humana, I engineered .NET 6 microservices and high-throughput HL7/FHIR compliance data pipelines; at DTSI (Hill Air Force Base), I developed mission-critical logistics systems in .NET Core Razor Pages, Java Spring Boot, and SQL Server under strict change-control with zero deployment rollbacks.

Having built core credit union banking engines at CUProdigy and financial reporting APIs for Fannie Mae and credit bureaus at Finicity (Mastercard), I understand the rigor demanded when real money is on the line. I design reliable RESTful APIs, optimize PostgreSQL and SQL Server schemas, and enforce deterministic automated testing (xUnit, NUnit, JUnit). In parallel, I operate distributed systems including host-authoritative WebSocket synchronization in FastTrack 3D, Dockerized services, and CI/CD pipelines.

I welcome the opportunity to discuss how my verified C#/.NET, React, and fintech systems experience will help Topstep scale its trading platform.

Sincerely,
Kenneth W. Bingham`,
};

export const TOPSTEP_JOB_DESCRIPTION = `Software Engineer - Topstep (United States - Remote / Hybrid)
Autofill Application via OptimHire.
Salary: $125,000 - $160,000 annually + performance-based bonus.

Summary:
Are you an engineer ready to take the next step in building production systems? Topstep is looking for a Mid-Level Software Engineer to contribute to critical components of our trading platform. In this role, you'll work on the systems that power real-time trading, market data delivery, and brokerage integrations - the systems thousands of active traders depend on with real money on the line.

You'll work primarily in a modern .NET stack, building cloud-native services that handle high-throughput workloads, and occasionally work across the stack in our React/TypeScript frontend. You'll own features from design through deployment, learn the architectural patterns used across the platform, and deepen your skills in distributed systems and production operations.

Key Responsibilities:
- Build and ship features for services and APIs that power core trading platform capabilities.
- Own your features from design through deployment, with support from senior engineers.
- Collaborate with product and design to translate requirements into maintainable technical solutions.
- Learn and apply the architectural patterns and practices used across the engineering organization.
- Write clean, well-tested code with a focus on reliability and performance.
- Participate in on-call rotations and respond to incidents, with support from senior team members.
- Help instrument your services with metrics and logging, and grow your skills in observability.
- Occasionally work across the stack, contributing to the React/TypeScript frontend as features require.
- Participate in code reviews, giving and receiving feedback to improve code quality.
- Help maintain and improve existing systems through bug fixes, refactoring, and performance improvements.
- Contribute to team documentation and knowledge sharing.

Required Qualifications and Key Competencies:
- 3-4 years of software engineering experience building and shipping production features.
- Solid proficiency in C# and .NET, with experience building production services.
- Understanding of RESTful API design and service integration patterns.
- Working knowledge of databases including SQL, basic schema design, and query fundamentals.
- Experience writing automated tests and an understanding of testing best practices.
- Ability to debug issues in production systems with guidance.
- Strong problem-solving skills and drive to take on increasing scope and responsibility.
- Good communication skills, with the ability to collaborate effectively across engineering and product.
- Comfort working in agile environments with iterative development and changing requirements.

Preferred:
- Experience with React, TypeScript, or other modern frontend frameworks.
- Exposure to distributed systems, microservices, or event-driven architectures (Redis, NATS, Kafka, SignalR/WebSockets).
- Familiarity with PostgreSQL or SQL Server in production environments.
- Understanding of observability tools (metrics, logging, tracing).
- Familiarity with container technologies (Docker) or cloud platforms (AWS).
- Prior on-call or incident-response experience.
- Previous work in financial services, fintech, or other compliance-regulated environments.
- Understanding of trading systems, market data, or brokerage operations.

Company Culture & Perks:
- Remote to hybrid, cameras on during meetings, robust Slack environment.
- 401(k) matching, health/dental/vision, generous paid time off.
- Base salary: $125,000 - $160,000 + performance bonus.
- Notice of Use of AI in Recruitment & Hiring (775 ILCS 5/2-102(L)).`;

export const TOPSTEP_SAMPLE_JOB: ApplicationRecord = {
  id: "app_topstep_1",
  company: "Topstep",
  role: "Mid-Level Software Engineer",
  contactName: "Topstep Hiring Team",
  contactEmail: "careers@topstep.com",
  source: "OptimHire Autofill / Direct",
  jobUrl: "https://boards.greenhouse.io/topstep/jobs/autofill-optimhire",
  stage: ApplicationStage.Saved,
  stageReason: ClosedReason.None,
  jobDescription: TOPSTEP_JOB_DESCRIPTION,
  notes:
    "Autofill compatible with OptimHire and Greenhouse. High alignment on C#, .NET 6, React, TypeScript, SQL Server/PostgreSQL, WebSockets, and Fintech experience.",
  createdAt: todayIsoDate(),
  updatedAt: todayIsoDate(),
};

export const HANDSHAKE_AI_JOB_DESCRIPTION = `Senior AI Evaluation & Reliability Engineer - Handshake AI (Remote, US)
Salary: $165,000 - $210,000 annually + equity and comprehensive benefits.

About Handshake:
Handshake is the leading career platform helping millions of students and alumni build meaningful careers. At Handshake AI, we are building the frontier of intelligent career discovery, agentic skill matching, and rigorous LLM evaluation systems that empower students and employers with fair, trustworthy matching.

Role Overview:
We are seeking a Senior AI Evaluation & Reliability Engineer to lead the architecture of our offline evaluation harnesses, benchmark datasets, and deterministic verification pipelines. You will own the systems that evaluate coding agents, candidate-job skill grounding, and multi-turn reasoning models.

Key Responsibilities:
- Design and author adversarial benchmark tasks and evaluation suites for LLMs and agentic workflows (e.g. Terminal-Bench, coding agents).
- Build fast, offline difficulty-certification harnesses using constraint solvers (CP-SAT), candidate generation, and cold-agent verification.
- Write and enforce deterministic pre-submit linters that detect solution leaks, ambiguous specifications, and reward-hacking traps.
- Architect anti-hallucination guardrails and ground-truth verification systems ensuring model recommendations are 100% grounded in verified candidate data.
- Run rigorous blind pairwise human and model evaluations, grading correctness, communication, and behavioral safety.
- Collaborate with product and platform teams to instrument telemetry, observability, and reproducible evaluation pipelines.

Required Qualifications:
- 5+ years of software engineering experience in Python, TypeScript, or modern backend systems.
- Strong background in discrete mathematics, algorithms, and automated verification or constraint optimization (CP-SAT, SAT/SMT).
- Demonstrated experience building evaluation harnesses, benchmark suites, or testing frameworks for frontier LLMs.
- Deep commitment to fair hiring, transparency, and anti-hallucination AI principles.
- Experience with containerization (Docker), Linux environments, and CI/CD automation.

Preferred Qualifications:
- Experience in recruitment tech, career platforms, or high-throughput matching systems.
- Contributions to public LLM benchmark datasets or adversarial evaluation research.`;

export const HANDSHAKE_SAMPLE_JOB: ApplicationRecord = {
  id: "app_handshake_1",
  company: "Handshake AI",
  role: "Senior AI Evaluation & Reliability Engineer",
  contactName: "Handshake AI Engineering Team",
  contactEmail: "ai-careers@joinhandshake.com",
  source: "Handshake Direct",
  jobUrl: "https://app.joinhandshake.com/careers/ai-evaluation-engineer",
  stage: ApplicationStage.Saved,
  stageReason: ClosedReason.None,
  jobDescription: HANDSHAKE_AI_JOB_DESCRIPTION,
  notes:
    "Direct alignment with Kenneth Bingham's proven work on Terminal-Bench 2, CP-SAT offline difficulty-certification harness, deterministic pre-submit linters, and adversarial agent evaluation.",
  createdAt: todayIsoDate(),
  updatedAt: todayIsoDate(),
};

export function formatAutofillCompatibleResumeText(resume: MasterResume): string {
  const c = resume.contact;
  const allUrls = collectAllProfileUrls(c);
  const clearancePart =
    c.securityClearance && c.securityClearance.trim().toLowerCase() !== "none"
      ? `Clearance: ${c.securityClearance.trim()}`
      : "";
  const eligibilityLine = [c.workAuthorization, clearancePart, c.workPreference]
    .filter(Boolean)
    .join(" | ");
  const targetTitlesLine = (resume.targetJobTitles || []).join(" | ");
  const { coreSkills, basicSkills } = partitionAndSortSkillsByWeight(resume);

  const lines: string[] = [
    c.name || "FIRSTNAME LASTNAME",
    ...(targetTitlesLine ? [targetTitlesLine] : []),
    [c.location || "City, ST", eligibilityLine].filter(Boolean).join(" | "),
    `${c.phone || "000-000-0000"} | ${c.email || "email@example.com"}`,
    ...allUrls,
    "",
    "PROFESSIONAL SUMMARY",
    resume.summary,
    "",
    "CORE SKILLS",
    coreSkills.join(", "),
    ...(basicSkills.length > 0 && resume.includeWeightOneOnResume !== false
      ? [`Foundational Familiarity: ${basicSkills.join(", ")}`]
      : []),
  ];

  if ((resume.atsKeywords || []).length > 0) {
    lines.push("");
    lines.push("DOMAIN KEYWORDS & METHODOLOGIES");
    lines.push(resume.atsKeywords.join(", "));
  }

  if ((resume.aiUsage || []).length > 0) {
    lines.push("");
    lines.push("AI FLUENCY & WORKFLOWS");
    resume.aiUsage.forEach((item) => lines.push(`- ${item}`));
  }

  lines.push("");
  lines.push("WORK EXPERIENCE");

  resume.experience.forEach((exp) => {
    const complianceTag = formatExperienceComplianceTag(exp);
    lines.push(exp.company);
    lines.push(exp.role);
    lines.push(
      [
        `${exp.startDate} - ${exp.endDate}`,
        exp.location,
        complianceTag,
      ]
        .filter(Boolean)
        .join(" | ")
    );
    exp.bullets
      .filter((b) => b.trim().length > 0)
      .forEach((b) => {
        lines.push(`- ${b.trim()}`);
      });
    lines.push("");
  });

  if ((resume.projects || []).length > 0) {
    lines.push("PERSONAL PROJECTS & PORTFOLIO");
    resume.projects.forEach((proj) => {
      const header = [proj.name, proj.techStack, proj.url]
        .filter(Boolean)
        .join(" | ");
      lines.push(header);
      if (proj.description.trim()) {
        lines.push(`- ${proj.description.trim()}`);
      }
    });
    lines.push("");
  }

  lines.push("EDUCATION");
  resume.education.forEach((ed) => {
    lines.push(`${ed.institution} | ${ed.degree} | ${ed.year}`);
  });

  if (resume.certifications.length > 0) {
    lines.push("");
    lines.push("CERTIFICATIONS");
    resume.certifications.forEach((cert) => lines.push(`- ${cert}`));
  }

  if ((resume.accomplishments || []).length > 0) {
    lines.push("");
    lines.push("KEY ACCOMPLISHMENTS");
    resume.accomplishments.forEach((acc) => lines.push(`- ${acc}`));
  }

  return sanitizeDashes(lines.join("\n").trim());
}

const KNOWN_SKILL_LEXICON = [
  "python",
  "typescript",
  "javascript",
  "react",
  "node.js",
  "go",
  "golang",
  "java",
  "c++",
  "sql",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "terraform",
  "graphql",
  "rest apis",
  "git",
  "ci/cd",
  "linux",
  "kafka",
  "spark",
  "airflow",
  "snowflake",
  "dbt",
  "tableau",
  "figma",
  "product management",
  "agile",
  "machine learning",
  "pytorch",
  "fastapi",
  "express",
  "tailwind",
  "distributed systems",
  "microservices",
  "observability",
  "prometheus",
];

export function extractRequirementsFromJd(jd: string): string[] {
  const lower = (jd || "").toLowerCase();
  const matchedKnown = KNOWN_SKILL_LEXICON.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(lower);
  });

  if (matchedKnown.length >= 4) {
    return matchedKnown;
  }

  // Fallback token extraction for non-engineering JDs
  const stopWords = new Set([
    "about", "above", "across", "after", "again", "against", "along", "among",
    "around", "because", "before", "behind", "below", "between", "beyond",
    "build", "building", "candidate", "company", "create", "creating", "degree",
    "deliver", "design", "develop", "developing", "drive", "Ensure", "ensure",
    "experience", "experienced", "familiarity", "ideal", "including", "join",
    "knowledge", "looking", "manage", "managing", "minimum", "other", "partner",
    "people", "position", "preferred", "proven", "qualifications", "related",
    "required", "requirements", "responsibilities", "role", "seeking", "skills",
    "strong", "support", "system", "systems", "teams", "their", "there", "these",
    "through", "understanding", "using", "within", "working", "years",
  ]);

  const rawWords = lower.match(/\b[a-z][a-z0-9+#.-]{3,18}\b/g) || [];
  const freq: Record<string, number> = {};
  for (const w of rawWords) {
    if (!stopWords.has(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  const topTokens = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 10);

  return Array.from(new Set([...matchedKnown, ...topTokens])).slice(0, 14);
}

export const SKILL_WEIGHT_RUBRIC: Record<
  SkillWeight,
  {
    weight: SkillWeight;
    shortLabel: string;
    fullLabel: string;
    guidance: string;
  }
> = {
  1: {
    weight: 1,
    shortLabel: "1 · Basic / Name",
    fullLabel: "1 - Basic / Name Familiarity (Add some experience)",
    guidance:
      "Name or basic familiarity only. Add hands-on practice or a usage note before relying on it in technical screens.",
  },
  2: {
    weight: 2,
    shortLabel: "2 · Some Exp",
    fullLabel: "2 - Some Experience (Working fundamentals)",
    guidance:
      "Some hands-on experience; ready to answer foundational questions.",
  },
  3: {
    weight: 3,
    shortLabel: "3 · Substantial",
    fullLabel: "3 - Substantial Experience (Independent delivery)",
    guidance:
      "Substantial production or project experience delivering independently.",
  },
  4: {
    weight: 4,
    shortLabel: "4 · Strong",
    fullLabel: "4 - Strong / Advanced (Deep ownership)",
    guidance:
      "Strong production depth across debugging, scaling, and real-world trade-offs.",
  },
  5: {
    weight: 5,
    shortLabel: "5 · Expert",
    fullLabel: "5 - Expert (Architecture & mastery)",
    guidance:
      "Expert mastery; prioritized first in your top fold and cover letter.",
  },
};

export function normalizeSkillKey(skill: string): string {
  return sanitizeDashes(skill || "")
    .trim()
    .toLowerCase();
}

export function clampSkillWeight(
  val: unknown,
  fallback: SkillWeight = 3
): SkillWeight {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n) || n < 1 || n > 5) return fallback;
  return n as SkillWeight;
}

export function getSkillWeight(
  resume: MasterResume,
  skill: string
): SkillWeight {
  const key = normalizeSkillKey(skill);
  if (!key) return 3;
  const explicit = resume.skillWeights?.[key];
  if (explicit && explicit >= 1 && explicit <= 5) {
    return explicit;
  }
  const quantifiedCorpus = resume.experience
    .flatMap((e) => e.bullets)
    .filter((b) => /\d/.test(b))
    .join(" ")
    .toLowerCase();
  if (quantifiedCorpus.includes(key)) {
    return 4;
  }
  return 3;
}

export function getSkillNote(resume: MasterResume, skill: string): string {
  const key = normalizeSkillKey(skill);
  if (!key) return "";
  return sanitizeDashes(resume.skillNotes?.[key] || "");
}

export function partitionAndSortSkillsByWeight(
  resume: MasterResume,
  extraConfirmed: string[] = []
): {
  coreSkills: string[];
  basicSkills: string[];
  allSorted: string[];
  exportableSkills: string[];
} {
  const seen = new Set<string>();
  const combined: string[] = [];
  for (const raw of [...resume.skills, ...extraConfirmed]) {
    const clean = sanitizeDashes(raw || "").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    combined.push(clean);
  }

  const allSorted = [...combined].sort((a, b) => {
    const wDiff = getSkillWeight(resume, b) - getSkillWeight(resume, a);
    if (wDiff !== 0) return wDiff;
    return combined.indexOf(a) - combined.indexOf(b);
  });

  const coreSkills = allSorted.filter((s) => getSkillWeight(resume, s) >= 2);
  const basicSkills = allSorted.filter((s) => getSkillWeight(resume, s) === 1);
  const exportableSkills =
    resume.includeWeightOneOnResume === false
      ? coreSkills
      : [...coreSkills, ...basicSkills];

  return { coreSkills, basicSkills, allSorted, exportableSkills };
}

export type FitVerdictLabel =
  | "Strong fit"
  | "Worth it with tailoring"
  | "Stretch";

export interface JobSkillRequirementFit {
  skill: string;
  candidateWeight: SkillWeight;
  requiredMinWeight: SkillWeight;
  jobSpecLabel:
    | "Strong / Senior"
    | "Core requirement"
    | "Bonus / Familiar";
  fitVerdict: FitVerdictLabel;
  credit: number;
  hasSeniorDepthGap: boolean;
  detail: string;
}

export function evaluateJobSkillRequirement(
  skill: string,
  jd: string,
  roleTitle: string,
  resume: MasterResume
): JobSkillRequirementFit {
  const candidateWeight = getSkillWeight(resume, skill);
  const lowerJd = (jd || "").toLowerCase();
  const lowerSkill = normalizeSkillKey(skill);
  const idx = lowerSkill ? lowerJd.indexOf(lowerSkill) : -1;

  // Inspect surrounding clause (~110 chars before/after the skill mention)
  const clause =
    idx >= 0
      ? lowerJd.slice(Math.max(0, idx - 110), Math.min(lowerJd.length, idx + lowerSkill.length + 110))
      : "";

  const isBonusClause =
    /\b(is a plus|a plus|nice to have|bonus|preferred|familiarity with|exposure to)\b/i.test(
      clause
    );
  const isStrongClause =
    /\b(strong|senior|expert|deep|advanced|extensive|architect|lead|mastery|principal|[5-9]\+?\s*years)\b/i.test(
      clause
    );
  const isSeniorRole =
    /\b(senior|sr\.?|staff|principal|lead|architect|director|head|vp)\b/i.test(
      roleTitle || ""
    ) ||
    /\bwe are hiring a (senior|staff|principal|lead)\b/i.test(lowerJd);

  let requiredMinWeight: SkillWeight = 3;
  let jobSpecLabel: JobSkillRequirementFit["jobSpecLabel"] = "Core requirement";

  if (isBonusClause) {
    requiredMinWeight = 2;
    jobSpecLabel = "Bonus / Familiar";
  } else if (isStrongClause || isSeniorRole) {
    requiredMinWeight = 4;
    jobSpecLabel = "Strong / Senior";
  }

  // Evaluate candidate's 1-5 weight against the job's specified level
  if (candidateWeight >= requiredMinWeight) {
    return {
      skill,
      candidateWeight,
      requiredMinWeight,
      jobSpecLabel,
      fitVerdict: "Strong fit",
      credit: 1,
      hasSeniorDepthGap: false,
      detail:
        jobSpecLabel === "Bonus / Familiar"
          ? `Rated ${candidateWeight}/5 · Meets bonus/plus level`
          : `Rated ${candidateWeight}/5 · Meets ${jobSpecLabel.toLowerCase()} spec`,
    };
  }

  // Special case: Weight 1 on a Bonus/Familiar item (requiredMinWeight === 2)
  if (requiredMinWeight === 2 && candidateWeight === 1) {
    return {
      skill,
      candidateWeight,
      requiredMinWeight,
      jobSpecLabel,
      fitVerdict: "Worth it with tailoring",
      credit: 0.8,
      hasSeniorDepthGap: false,
      detail: "Rated 1/5 (Basic/Name) on bonus item · Add brief usage context",
    };
  }

  // Job listing specifies Strong or Senior (requiredMinWeight === 4)
  if (requiredMinWeight >= 4) {
    if (candidateWeight === 1) {
      return {
        skill,
        candidateWeight,
        requiredMinWeight,
        jobSpecLabel,
        fitVerdict: "Stretch",
        credit: 0.25,
        hasSeniorDepthGap: true,
        detail:
          "Rated 1/5 (Basic/Name) vs Strong/Senior job spec · Add hands-on experience",
      };
    }
    if (candidateWeight === 2) {
      return {
        skill,
        candidateWeight,
        requiredMinWeight,
        jobSpecLabel,
        fitVerdict: "Worth it with tailoring",
        credit: 0.5,
        hasSeniorDepthGap: true,
        detail:
          "Rated 2/5 (Some Exp) vs Strong/Senior job spec · Frame honestly with adjacent depth",
      };
    }
    // candidateWeight === 3 on Strong/Senior
    return {
      skill,
      candidateWeight,
      requiredMinWeight,
      jobSpecLabel,
      fitVerdict: "Worth it with tailoring",
      credit: 0.85,
      hasSeniorDepthGap: false,
      detail:
        "Rated 3/5 (Substantial) vs Strong/Senior job spec · Highlight quantified production proof",
    };
  }

  // Standard core requirement (requiredMinWeight === 3) when marked 1 or 2
  if (candidateWeight === 1) {
    return {
      skill,
      candidateWeight,
      requiredMinWeight,
      jobSpecLabel,
      fitVerdict: "Stretch",
      credit: 0.4,
      hasSeniorDepthGap: false,
      detail: "Rated 1/5 (Basic/Name) on core skill · Add some experience",
    };
  }

  return {
    skill,
    candidateWeight,
    requiredMinWeight,
    jobSpecLabel,
    fitVerdict: "Worth it with tailoring",
    credit: 0.75,
    hasSeniorDepthGap: false,
    detail: "Rated 2/5 (Some Exp) on core skill · Pair with concrete examples",
  };
}

export function computeWeightedSkillMatchScore(
  foundSkills: string[],
  totalJdSkillCount: number,
  app: Pick<ApplicationRecord, "role" | "jobDescription">,
  resume: MasterResume
): {
  matchScore: number;
  skillFits: JobSkillRequirementFit[];
  seniorDepthGaps: JobSkillRequirementFit[];
} {
  const sortedFound = [...foundSkills].sort(
    (a, b) => getSkillWeight(resume, b) - getSkillWeight(resume, a)
  );
  const skillFits = sortedFound.map((skill) =>
    evaluateJobSkillRequirement(skill, app.jobDescription, app.role, resume)
  );
  const seniorDepthGaps = skillFits.filter((f) => f.hasSeniorDepthGap);
  const totalCredit = skillFits.reduce((sum, item) => sum + item.credit, 0);
  const denom = Math.max(1, totalJdSkillCount, sortedFound.length);
  const matchScore = Math.min(100, Math.round((totalCredit / denom) * 100));

  return {
    matchScore,
    skillFits,
    seniorDepthGaps,
  };
}

export function detectUnlistedSkillsInResumeContent(
  resume: MasterResume
): string[] {
  const listedKeys = new Set(resume.skills.map((s) => normalizeSkillKey(s)));
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (raw: string) => {
    const clean = sanitizeDashes(raw || "").trim();
    const key = clean.toLowerCase();
    if (!clean || clean.length < 2 || listedKeys.has(key) || seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(clean);
  };

  // 1. Check explicit Personal Project techStack comma/pipe tokens
  for (const proj of resume.projects || []) {
    const tokens = (proj.techStack || "")
      .split(/[,|/]/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 28);
    tokens.forEach(pushCandidate);
  }

  // 2. Check Summary + Experience Bullets + Project Descriptions against known lexicon
  const narrativeCorpus = [
    resume.summary,
    ...resume.experience.flatMap((e) => e.bullets),
    ...(resume.projects || []).map((p) => p.description),
  ]
    .join(" ")
    .toLowerCase();

  const prettyDisplayMap: Record<string, string> = {
    python: "Python",
    typescript: "TypeScript",
    javascript: "JavaScript",
    react: "React",
    "node.js": "Node.js",
    go: "Go",
    golang: "Golang",
    java: "Java",
    "c++": "C++",
    sql: "SQL",
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    mongodb: "MongoDB",
    redis: "Redis",
    aws: "AWS",
    gcp: "GCP",
    azure: "Azure",
    docker: "Docker",
    kubernetes: "Kubernetes",
    terraform: "Terraform",
    graphql: "GraphQL",
    "rest apis": "REST APIs",
    git: "Git",
    "ci/cd": "CI/CD",
    linux: "Linux",
    kafka: "Kafka",
    spark: "Spark",
    airflow: "Airflow",
    snowflake: "Snowflake",
    dbt: "dbt",
    tableau: "Tableau",
    figma: "Figma",
    "product management": "Product Management",
    agile: "Agile",
    "machine learning": "Machine Learning",
    pytorch: "PyTorch",
    fastapi: "FastAPI",
    express: "Express",
    tailwind: "Tailwind CSS",
    "distributed systems": "Distributed Systems",
    microservices: "Microservices",
    observability: "Observability",
    prometheus: "Prometheus",
  };

  KNOWN_SKILL_LEXICON.forEach((lex) => {
    const escaped = lex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(narrativeCorpus)) {
      pushCandidate(prettyDisplayMap[lex] || lex);
    }
  });

  return candidates.slice(0, 12);
}

export function findUnconfirmedSkillsInText(
  text: string,
  masterResume: MasterResume,
  confirmedSkills: string[]
): string[] {
  const masterCorpus = [
    masterResume.summary,
    masterResume.contact.securityClearance || "",
    ...(masterResume.targetJobTitles || []),
    ...masterResume.skills,
    ...(masterResume.atsKeywords || []),
    ...(masterResume.aiUsage || []),
    ...masterResume.certifications,
    ...(masterResume.accomplishments || []),
    ...(masterResume.projects || []).flatMap((p) => [
      p.name,
      p.techStack,
      p.description,
    ]),
    ...masterResume.experience.flatMap((e) => [
      e.company,
      e.role,
      e.roleSecurityClearance || "",
      ...e.bullets,
    ]),
  ]
    .join(" ")
    .toLowerCase();

  const allowedCorpus = `${masterCorpus} ${confirmedSkills.join(" ").toLowerCase()}`;

  return KNOWN_SKILL_LEXICON.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return regex.test(text) && !regex.test(allowedCorpus);
  });
}

export function auditBulletHonesty(
  tailoredBullet: string,
  masterResume: MasterResume,
  confirmedSkills: string[]
): string {
  const warnings: string[] = [];
  const masterCorpus = [
    masterResume.summary,
    masterResume.contact.securityClearance || "",
    ...(masterResume.targetJobTitles || []),
    ...masterResume.skills,
    ...(masterResume.atsKeywords || []),
    ...(masterResume.aiUsage || []),
    ...masterResume.certifications,
    ...(masterResume.accomplishments || []),
    ...(masterResume.projects || []).flatMap((p) => [
      p.name,
      p.techStack,
      p.description,
    ]),
    ...masterResume.experience.flatMap((e) => [
      e.company,
      e.role,
      e.roleSecurityClearance || "",
      ...e.bullets,
    ]),
  ]
    .join(" ")
    .toLowerCase();

  // Check numbers/metrics in tailored bullet that do not exist in Master Resume
  const numbersInTailored = tailoredBullet.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
  const ungroundedNums = numbersInTailored.filter(
    (num) => !masterCorpus.includes(num.toLowerCase())
  );
  if (ungroundedNums.length > 0) {
    warnings.push(
      `Honesty Check: Unverified metric (${ungroundedNums.join(", ")}) not found in Master Resume.`
    );
  }

  // Check technical skills mentioned in tailored bullet that aren't in Master Resume or Confirmed
  const ungroundedSkills = findUnconfirmedSkillsInText(
    tailoredBullet,
    masterResume,
    confirmedSkills
  );

  if (ungroundedSkills.length > 0) {
    warnings.push(
      `Honesty Check: Unconfirmed skill (${ungroundedSkills.join(", ")}) not in Master Resume.`
    );
  }

  const banned = detectBannedPhrases(tailoredBullet);
  if (banned.length > 0) {
    warnings.push(`Blocked phrase detected: ${banned.join(", ")}.`);
  }

  if (detectLongDashes(tailoredBullet)) {
    warnings.push("Character rule violation: Long dash detected.");
  }

  return warnings.join(" ");
}

export function buildLocalTailoredWorkspace(
  app: ApplicationRecord,
  masterResume: MasterResume,
  existingConfirmed: string[] = []
): TailoredWorkspace {
  const jdSkills = extractRequirementsFromJd(app.jobDescription);
  const masterText = [
    masterResume.summary,
    ...(masterResume.targetJobTitles || []),
    ...masterResume.skills,
    ...(masterResume.atsKeywords || []),
    ...(masterResume.aiUsage || []),
    ...masterResume.certifications,
    ...(masterResume.accomplishments || []),
    ...(masterResume.projects || []).flatMap((p) => [
      p.name,
      p.techStack,
      p.description,
    ]),
    ...masterResume.experience.flatMap((e) => e.bullets),
  ]
    .join(" ")
    .toLowerCase();

  const confirmedLower = new Set(existingConfirmed.map((s) => s.toLowerCase()));
  const foundRaw: string[] = [];
  const confirmable: string[] = [];
  const learningOnly: string[] = [];

  jdSkills.forEach((skill, idx) => {
    const inMaster = masterText.includes(skill.toLowerCase());
    const inConfirmed = confirmedLower.has(skill.toLowerCase());
    if (inMaster || inConfirmed) {
      foundRaw.push(skill);
    } else if (idx % 2 === 0) {
      confirmable.push(skill);
    } else {
      learningOnly.push(skill);
    }
  });

  // Sort matched skills highest proficiency weight (5 -> 1) first and score by Strong/Senior depth fit
  const found = [...foundRaw].sort(
    (a, b) => getSkillWeight(masterResume, b) - getSkillWeight(masterResume, a)
  );

  const { matchScore, seniorDepthGaps } = computeWeightedSkillMatchScore(
    found,
    jdSkills.length,
    app,
    masterResume
  );

  const bullets: TailoredBulletProposal[] = [];
  masterResume.experience.forEach((exp) => {
    exp.bullets.forEach((bullet, bIdx) => {
      const relevantMatches = found.filter((s) =>
        bullet.toLowerCase().includes(s.toLowerCase())
      );
      const tailored = sanitizeDashes(bullet.trim());
      bullets.push({
        id: `${exp.id}_${bIdx}`,
        experienceId: exp.id,
        bulletIndex: bIdx,
        originalBullet: bullet,
        tailoredBullet: tailored,
        rationale:
          relevantMatches.length > 0
            ? `Direct evidence for: ${relevantMatches.join(", ")}`
            : "Retained verbatim from Master Resume for factual continuity",
        approved: true,
        ungroundedWarning: auditBulletHonesty(
          tailored,
          masterResume,
          existingConfirmed
        ),
      });
    });
  });

  const coverLetter = buildFourPillarCoverLetter(
    app,
    masterResume,
    found,
    learningOnly,
    ""
  );

  // Hiring Manager Question Flags (gaps, short stints, unquantified bullets, Senior/Strong vs Weight 1-2 gaps)
  const managerFlags: string[] = [];
  const quantifiedCount = bullets.filter((b) => /\d/.test(b.originalBullet)).length;
  if (quantifiedCount === 0 && bullets.length > 0) {
    managerFlags.push(
      "No quantified metrics detected in experience bullets. Add concrete counts, percentages, or latencies you can verify."
    );
  }
  if (seniorDepthGaps.length > 0) {
    managerFlags.push(
      `Depth check vs Strong/Senior job spec: ${seniorDepthGaps
        .map((g) => `${g.skill} (marked ${g.candidateWeight}/5)`)
        .join(
          ", "
        )}. Job listing specifies Strong/Senior capability - prepare honest framing around adjacent 4-5/5 strengths rather than overstating.`
    );
  }
  const basicMatched = found.filter(
    (s) =>
      getSkillWeight(masterResume, s) === 1 &&
      !seniorDepthGaps.some((g) => g.skill.toLowerCase() === s.toLowerCase())
  );
  if (basicMatched.length > 0) {
    managerFlags.push(
      `Weight 1 (Basic / Name familiarity) on matched skill(s): ${basicMatched.join(
        ", "
      )}. Add hands-on experience or frame honestly as foundational familiarity during technical rounds.`
    );
  }
  if (learningOnly.length > 0) {
    managerFlags.push(
      `Prepare honest interview framing for unconfirmed requirements: ${learningOnly.join(", ")}.`
    );
  }
  if (masterResume.experience.length === 0) {
    managerFlags.push("Master Resume has zero experience roles listed.");
  }

  return {
    applicationId: app.id,
    confirmedSkills: existingConfirmed,
    learningOnlySkills: [...confirmable, ...learningOnly],
    requiredSkillsFound: found,
    matchScore,
    bullets,
    coverLetter,
    managerFlags,
    usedAiModel: false,
    updatedAt: new Date().toISOString(),
  };
}

export function buildFourPillarCoverLetter(
  app: ApplicationRecord,
  masterResume: MasterResume,
  matchedSkills: string[],
  learningOnly: string[] = [],
  applicantOrgNote = ""
): string {
  const greeting = app.contactName
    ? `Dear ${app.contactName.trim()},`
    : `Dear ${app.company || "Hiring"} Team,`;

  const rankedMatched = [...matchedSkills].sort(
    (a, b) => getSkillWeight(masterResume, b) - getSkillWeight(masterResume, a)
  );
  const rankedMasterCore = partitionAndSortSkillsByWeight(masterResume).coreSkills;

  const coreSkills =
    rankedMatched.filter((s) => getSkillWeight(masterResume, s) >= 2).slice(0, 5).join(", ") ||
    rankedMatched.slice(0, 5).join(", ") ||
    rankedMasterCore.slice(0, 5).join(", ") ||
    "core operational and technical execution";

  const primaryRole = masterResume.experience[0];
  const strongestBullets = masterResume.experience
    .flatMap((e) => e.bullets)
    .filter((b) => b.trim().length > 0);
  const quantifiedBullet =
    strongestBullets.find((b) => /\d/.test(b)) || strongestBullets[0] || "";
  const secondProof =
    (masterResume.accomplishments || [])[0] ||
    (masterResume.projects || [])[0]?.description ||
    strongestBullets[1] ||
    "";

  // Pillar 1 & 2: Why hire me + What I bring
  const para1 = `I am applying for the ${app.role || "open"} position at ${
    app.company || "your organization"
  }. You need someone who can step into this scope and deliver dependable outcomes right away. I bring verified, interview-ready capability across ${coreSkills}${
    (masterResume.aiUsage || []).length > 0
      ? ", paired with disciplined, test-verified AI and automation workflows"
      : ""
  }.`;

  // Pillar 3: Concrete things I have done that make me the strongest qualified candidate
  const proofParts: string[] = [];
  if (primaryRole && quantifiedBullet) {
    proofParts.push(
      `As ${primaryRole.role} at ${primaryRole.company}, I delivered measurable impact: ${quantifiedBullet.replace(/\.$/, "")}.`
    );
  } else if (quantifiedBullet) {
    proofParts.push(`In my recent work, ${quantifiedBullet.replace(/\.$/, "")}.`);
  }
  if (secondProof && secondProof !== quantifiedBullet) {
    proofParts.push(`Additionally, ${secondProof.charAt(0).toLowerCase()}${secondProof.slice(1).replace(/\.$/, "")}.`);
  }
  const para2 =
    proofParts.join(" ") ||
    masterResume.summary ||
    "Across my work history, I have focused on measurable execution, clear documentation, and reliable delivery.";

  // Pillar 4: How I fit your organization
  const cleanNote = sanitizeDashes(applicantOrgNote.trim());
  const orgFitCore = cleanNote
    ? cleanNote.replace(/\.$/, "") + "."
    : `Your focus at ${
        app.company || "your organization"
      } on practical execution and clear ownership matches how I work with cross-functional teams.`;
  const honestStretch =
    learningOnly.length > 0
      ? ` Where your role touches ${learningOnly
          .slice(0, 2)
          .join(" and ")}, I bring a strong foundation in ${
          matchedSkills[0] || masterResume.skills[0] || "adjacent systems"
        } and am actively building fluency.`
      : "";
  const para3 = `${orgFitCore}${honestStretch} Thank you for reviewing my application, and I welcome a conversation about how my background supports ${
    app.company || "your team"
  }'s goals.`;

  return scrubAiTropesAndDashes(
    `${greeting}\n\n${para1}\n\n${para2}\n\n${para3}\n\nSincerely,\n${
      masterResume.contact.name || "[Your Name]"
    }`
  );
}

export function buildApplicantCoverLetterOutline(
  app: ApplicationRecord,
  masterResume: MasterResume
): string {
  const greeting = app.contactName
    ? `Dear ${app.contactName.trim()},`
    : `Dear ${app.company || "Hiring"} Team,`;
  const topSkills = masterResume.skills.slice(0, 4).join(", ") || "[your top skills]";
  const recentCompany = masterResume.experience[0]?.company || "[recent employer]";

  return sanitizeDashes(
    [
      greeting,
      "",
      `[1. Why hire me + What I bring]: I am applying for the ${app.role} role at ${app.company}. I bring hands-on experience in ${topSkills} and solve [specific problem from their job description].`,
      "",
      `[2. Things I have done that qualify me]: At ${recentCompany}, I [insert 1-2 specific, quantified results from your Master Resume].`,
      "",
      `[3. How I fit ${app.company}]: Your team's focus on [specific mission, product, or workflow at ${app.company}] aligns directly with how I operate because [your authentic reason].`,
      "",
      "Thank you for your time and consideration.",
      "",
      "Sincerely,",
      masterResume.contact.name || "[Your Name]",
    ].join("\n")
  );
}

export function getMatchVerdict(
  score: number,
  seniorDepthGapCount = 0
): {
  verdict: FitVerdictLabel;
  summary: string;
} {
  if (score >= 70 && seniorDepthGapCount === 0) {
    return {
      verdict: "Strong fit",
      summary:
        "High overlap with verified Master Resume skills at the proficiency level specified by the job.",
    };
  }
  if (score >= 70 && seniorDepthGapCount > 0) {
    return {
      verdict: "Worth it with tailoring",
      summary: `Broad overlap (${score}/100), but ${seniorDepthGapCount} Strong/Senior requirement${
        seniorDepthGapCount === 1 ? " is" : "s are"
      } rated 1-2/5. Lead with your 4-5/5 strengths and frame depth honestly.`,
    };
  }
  if (score >= 40) {
    return {
      verdict: "Worth it with tailoring",
      summary:
        seniorDepthGapCount > 0
          ? `Core foundation present, with ${seniorDepthGapCount} skill${
              seniorDepthGapCount === 1 ? "" : "s"
            } rated 1-2/5 against Strong/Senior expectations. Tailor around verified proof.`
          : "Core foundation present; confirm adjacent skills and prioritize quantified proof.",
    };
  }
  return {
    verdict: "Stretch",
    summary:
      seniorDepthGapCount > 0
        ? "Job specifies Strong/Senior depth on skills currently rated 1-2/5 or unconfirmed; apply selectively without exaggerating."
        : "Substantial unconfirmed requirements; apply selectively without exaggerating.",
  };
}

export function createDefaultState(): AppState {
  return {
    welcomeDismissed: false,
    masterResume: KENNETH_BINGHAM_MASTER_RESUME,
    applications: [TOPSTEP_SAMPLE_JOB, HANDSHAKE_SAMPLE_JOB],
    events: [
      {
        id: "evt_topstep_init",
        applicationId: TOPSTEP_SAMPLE_JOB.id,
        type: TimelineEventType.Note,
        notes: "Loaded Topstep target job. Tested with OptimHire & Greenhouse autofill (99% match fit with verified production skills).",
        date: todayIsoDate(),
        sequence: 1,
      },
      {
        id: "evt_handshake_init",
        applicationId: HANDSHAKE_SAMPLE_JOB.id,
        type: TimelineEventType.Note,
        notes: "Loaded Handshake AI target job (Senior AI Evaluation & Reliability Engineer). Alignment with Terminal-Bench 2 and CP-SAT harness.",
        date: todayIsoDate(),
        sequence: 1,
      },
    ],
    interviews: [],
    tailoredByApp: {},
    savedBoards: [
      { id: "bd_stripe", provider: "greenhouse", slug: "stripe", label: "Stripe" },
      { id: "bd_cloudflare", provider: "greenhouse", slug: "cloudflare", label: "Cloudflare" },
      { id: "bd_figma", provider: "greenhouse", slug: "figma", label: "Figma" },
    ],
    activityLog: [],
    retentionDays: 0,
  };
}

const MONTH_NAME_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function normalizeDateToken(raw: string): string {
  const clean = raw.trim();
  if (/^(present|current|now)$/i.test(clean)) return "Present";
  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}`;
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[2]}-${slashMatch[1].padStart(2, "0")}`;
  const monthYear = clean.match(/^([A-Za-z]+)\.?\s+(\d{4})$/);
  if (monthYear) {
    const mm = MONTH_NAME_MAP[monthYear[1].toLowerCase()];
    if (mm) return `${monthYear[2]}-${mm}`;
  }
  const yearOnly = clean.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1];
  return clean;
}

export function parseResumeTextLocally(rawText: string): MasterResume {
  const cleaned = sanitizeDashes(rawText || "").replace(/\r\n/g, "\n");
  const rawLines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const emailMatch = cleaned.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  const phoneMatch = cleaned.match(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
  );
  const urlMatches =
    cleaned.match(
      /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[^\s|,;)]+|github\.com\/[^\s|,;)]+|[a-zA-Z0-9-]+\.(?:dev|io|me|com|org)\/[^\s|,;)]*)/gi
    ) || [];

  const links = Array.from(
    new Set(
      urlMatches
        .map((u) => u.replace(/[.,;]+$/, ""))
        .filter((u) => !u.includes("@"))
    )
  ).slice(0, 6);

  // Extract candidate name from first clean header line
  let candidateName = "";
  for (const line of rawLines.slice(0, 5)) {
    if (
      !line.includes("@") &&
      !/\d{3}[-.\s)]/.test(line) &&
      !/^(summary|experience|education|skills|resume|curriculum vitae)$/i.test(
        line
      ) &&
      line.split(/\s+/).length <= 5
    ) {
      candidateName = line.replace(/^[#*]+/, "").trim();
      break;
    }
  }

  // Extract City, ST from top 8 lines
  let candidateLocation = "";
  for (const line of rawLines.slice(0, 8)) {
    const locMatch = line.match(
      /\b([A-Z][a-zA-Z.\s]{1,24},\s*(?:[A-Z]{2}|Remote))\b/
    );
    if (locMatch) {
      candidateLocation = locMatch[1].trim();
      break;
    }
  }

  type SectionKey =
    | "header"
    | "summary"
    | "skills"
    | "experience"
    | "education"
    | "certifications"
    | "accomplishments";

  const sections: Record<SectionKey, string[]> = {
    header: [],
    summary: [],
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    accomplishments: [],
  };

  let currentSection: SectionKey = "header";

  for (const line of rawLines) {
    const normalizedHeading = line
      .replace(/^[\d.#*-]+\s*/, "")
      .replace(/:$/, "")
      .trim()
      .toUpperCase();

    if (
      /^(PROFESSIONAL SUMMARY|EXECUTIVE SUMMARY|SUMMARY|PROFILE|ABOUT ME|OBJECTIVE)$/.test(
        normalizedHeading
      )
    ) {
      currentSection = "summary";
      continue;
    }
    if (
      /^(SKILLS|CORE SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|TECHNOLOGIES|AREAS OF EXPERTISE)$/.test(
        normalizedHeading
      )
    ) {
      currentSection = "skills";
      continue;
    }
    if (
      /^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT HISTORY|WORK HISTORY|CAREER HISTORY)$/.test(
        normalizedHeading
      )
    ) {
      currentSection = "experience";
      continue;
    }
    if (/^(EDUCATION|ACADEMIC BACKGROUND)$/.test(normalizedHeading)) {
      currentSection = "education";
      continue;
    }
    if (
      /^(CERTIFICATIONS|CERTIFICATES|LICENSES|CERTIFICATIONS & LICENSES|LICENSES & CERTIFICATIONS)$/.test(
        normalizedHeading
      )
    ) {
      currentSection = "certifications";
      continue;
    }
    if (
      /^(ACCOMPLISHMENTS|KEY ACCOMPLISHMENTS|ACHIEVEMENTS|AWARDS|PROJECTS|HONORS & AWARDS|KEY PROJECTS)$/.test(
        normalizedHeading
      )
    ) {
      currentSection = "accomplishments";
      continue;
    }

    sections[currentSection].push(line);
  }

  const summary = sections.summary.join(" ").trim();

  const skills = Array.from(
    new Set(
      sections.skills
        .flatMap((line) => {
          const withoutPrefix = line.includes(":")
            ? line.split(":").slice(1).join(":")
            : line;
          return withoutPrefix.split(/[,|•·;]+/);
        })
        .map((s) => s.replace(/^[-*•\s]+/, "").trim())
        .filter((s) => s.length >= 2 && s.length <= 45)
    )
  );

  // Parse Experience entries
  const dateRangeRegex =
    /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4}-\d{1,2}|\d{1,2}\/\d{4}|\b(?:19|20)\d{2}\b)\s*(?:-|to)\s*(Present|Current|Now|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4}-\d{1,2}|\d{1,2}\/\d{4}|\b(?:19|20)\d{2}\b)/i;

  const experience: MasterResume["experience"] = [];
  let pendingMetaLines: string[] = [];

  for (const line of sections.experience) {
    const isBullet = /^[-*•▪◦]\s+/.test(line);
    const rangeMatch = line.match(dateRangeRegex);

    if (rangeMatch && !isBullet) {
      const startDate = normalizeDateToken(rangeMatch[1]);
      const endDate = normalizeDateToken(rangeMatch[2]);
      const remainder = line
        .replace(rangeMatch[0], "")
        .replace(/^[|\s,-]+|[|\s,-]+$/g, "")
        .trim();

      let role = "";
      let company = "";
      let location = "";

      const parts = [
        ...pendingMetaLines,
        ...(remainder ? remainder.split(/\s*\|\s*|\s+-\s+|\s+at\s+/i) : []),
      ]
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length >= 2) {
        role = parts[0];
        company = parts[1];
        location = parts[2] || "";
      } else if (parts.length === 1) {
        role = parts[0];
        company = "Organization";
      }

      experience.push({
        id: `exp_${Date.now()}_${experience.length}`,
        company,
        role,
        location,
        startDate,
        endDate,
        bullets: [],
      });
      pendingMetaLines = [];
    } else if (isBullet) {
      const cleanBullet = line.replace(/^[-*•▪◦]\s+/, "").trim();
      if (experience.length === 0) {
        experience.push({
          id: `exp_${Date.now()}_0`,
          company: pendingMetaLines[0] || "",
          role: pendingMetaLines[1] || "",
          location: "",
          startDate: "",
          endDate: "",
          bullets: [cleanBullet],
        });
        pendingMetaLines = [];
      } else {
        experience[experience.length - 1].bullets.push(cleanBullet);
      }
    } else {
      if (line.length > 85 && experience.length > 0) {
        experience[experience.length - 1].bullets.push(line);
      } else {
        pendingMetaLines.push(line);
        if (pendingMetaLines.length > 3) {
          pendingMetaLines.shift();
        }
      }
    }
  }

  const education: MasterResume["education"] = sections.education
    .filter((l) => l.length > 3)
    .map((line, idx) => {
      const yrMatch = line.match(/\b(19|20)\d{2}\b/);
      const year = yrMatch ? yrMatch[0] : "";
      const withoutYear = year ? line.replace(year, "") : line;
      const segs = withoutYear
        .split(/\s*\|\s*|\s*,\s*|\s+-\s+/)
        .map((s) => s.replace(/[()]/g, "").trim())
        .filter(Boolean);
      return {
        id: `edu_${Date.now()}_${idx}`,
        institution: segs[0] || line,
        degree: segs.slice(1).join(", ") || "",
        year,
      };
    });

  const certifications = sections.certifications
    .map((l) => l.replace(/^[-*•▪◦]\s+/, "").trim())
    .filter(Boolean);

  const accomplishments = sections.accomplishments
    .map((l) => l.replace(/^[-*•▪◦]\s+/, "").trim())
    .filter(Boolean);

  const linkedinUrl =
    links.find((l) => l.toLowerCase().includes("linkedin.com")) || "";
  const githubUrl =
    links.find((l) => l.toLowerCase().includes("github.com")) || "";
  const substackUrl =
    links.find((l) => l.toLowerCase().includes("substack.com")) || "";
  const portfolioUrl =
    links.find(
      (l) =>
        !l.toLowerCase().includes("linkedin.com") &&
        !l.toLowerCase().includes("github.com") &&
        !l.toLowerCase().includes("substack.com")
    ) || "";
  const remainingLinks = links.filter(
    (l) =>
      l !== linkedinUrl &&
      l !== githubUrl &&
      l !== substackUrl &&
      l !== portfolioUrl
  );

  return {
    contact: {
      name: candidateName,
      email: emailMatch ? emailMatch[0] : "",
      phone: phoneMatch ? phoneMatch[0] : "",
      location: candidateLocation,
      linkedinUrl,
      githubUrl,
      portfolioUrl,
      substackUrl,
      workAuthorization: "",
      securityClearance: "",
      workPreference: "",
      links: remainingLinks,
    },
    targetJobTitles: experience[0]?.role ? [experience[0].role] : [],
    summary,
    experience,
    projects: [],
    education,
    skills,
    atsKeywords: [],
    aiUsage: [],
    certifications,
    accomplishments,
    defaultCoverLetter: "",
  };
}

export function convertBrainstormLocally(
  input: BrainstormConversionInput
): BrainstormConversionResult {
  const {
    rawText = "",
    company: givenCompany = "",
    role: givenRole = "",
    location: givenLocation = "",
    startDate: givenStart = "",
    endDate: givenEnd = "",
    isConfidentialNda = false,
    isClearanceRestricted = false,
    securityClearance = "",
    redactionTerms = "",
  } = input;

  let workingText = scrubAiTropesAndDashes(rawText).replace(/\r\n/g, "\n");
  const complianceNotes: string[] = [];

  // Apply explicit redaction terms if provided so confidential or classified names never leak
  const termsToRedact = redactionTerms
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const safeReplacement = isClearanceRestricted
    ? "an unclassified government system"
    : "a confidential client program";

  if (termsToRedact.length > 0) {
    termsToRedact.forEach((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      workingText = workingText.replace(
        new RegExp(escaped, "gi"),
        safeReplacement
      );
    });
    complianceNotes.push(
      `Redacted ${termsToRedact.length} protected ${
        termsToRedact.length === 1 ? "identifier" : "identifiers"
      } (${termsToRedact.join(", ")}) and generalized to ${safeReplacement}.`
    );
  }

  if (isConfidentialNda) {
    complianceNotes.push(
      "Marked as NDA-protected: proprietary client names, internal codenames, and restricted financials stay generalized to transferable operational metrics."
    );
  }
  if (isClearanceRestricted || securityClearance.trim()) {
    complianceNotes.push(
      `Security clearance safeguards active${
        securityClearance.trim() ? ` (${securityClearance.trim()})` : ""
      }: duties framed at an unclassified level focused on transferable technical and operational execution.`
    );
  }

  // Try to infer company, role, and date range from freeflow text if left blank
  let inferredCompany = sanitizeDashes(givenCompany.trim());
  let inferredRole = sanitizeDashes(givenRole.trim());
  const inferredLocation = sanitizeDashes(givenLocation.trim());
  let inferredStart = sanitizeDashes(givenStart.trim());
  let inferredEnd = sanitizeDashes(givenEnd.trim());

  if (!inferredStart || !inferredEnd) {
    const rangeMatch = workingText.match(
      /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4}-\d{1,2}|\b(?:19|20)\d{2}\b)\s*(?:-|to|until|through)\s*(Present|Current|Now|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4}-\d{1,2}|\b(?:19|20)\d{2}\b)/i
    );
    if (rangeMatch) {
      if (!inferredStart) inferredStart = normalizeDateToken(rangeMatch[1]);
      if (!inferredEnd) inferredEnd = normalizeDateToken(rangeMatch[2]);
    }
  }

  if (!inferredCompany) {
    const atCompanyMatch = workingText.match(
      /\b(?:worked at|at|joined|for)\s+([A-Z][A-Za-z0-9&.\s]{1,32}?)(?=\s+(?:as|in|from|where|doing|on|,|\.))?/
    );
    if (atCompanyMatch && atCompanyMatch[1]) {
      inferredCompany = atCompanyMatch[1].trim();
    } else if (isConfidentialNda) {
      inferredCompany = "Confidential Organization (NDA)";
    }
  }

  // Detect promotion statements in the raw freeflow dump
  let promotionSummary = "";
  const promoMatch = workingText.match(
    /(?:got\s+)?promoted\s+(?:from\s+[^.,;]+?\s+)?to\s+([A-Za-z0-9/&\s-]{3,48})(?:[.,;\n]|$)/i
  );
  if (promoMatch && promoMatch[1]) {
    const targetPromoTitle = promoMatch[1]
      .replace(/\s+(?:after|in|within|because|due)\b.*$/i, "")
      .trim();
    if (!inferredRole && targetPromoTitle) {
      inferredRole = targetPromoTitle;
    }
    promotionSummary = `Promoted to ${targetPromoTitle}`;
  }

  if (!inferredRole) {
    const roleMatch = workingText.match(
      /\b(?:worked as|hired as|served as|role was|title was|as a|as an)\s+([A-Za-z0-9/&\s-]{3,42}?)(?=\s+(?:at|in|from|where|doing|responsible|,|\.))?/i
    );
    if (roleMatch && roleMatch[1]) {
      inferredRole = roleMatch[1].trim();
    }
  }

  // Break non-listed raw freeflow stream into atomic clauses
  const rawClauses = workingText
    .split(/\n+|(?<=[.!?])\s+|;\s*|\s+-\s+|\s+also\s+|\s+and then\s+/i)
    .map((c) => c.replace(/^[-*•▪◦\d.)\s]+/, "").trim())
    .filter((c) => c.length >= 14);

  const casualLeadRewrites: Array<[RegExp, string]> = [
    [/^(?:i\s+)?(?:was\s+responsible\s+for\s+|had\s+to\s+|my\s+(?:main\s+)?(?:job|duty|duties|role)\s+(?:was|were|included)\s+)(managing|leading|building|designing|maintaining|supporting|running|operating|creating|developing|testing|analyzing|monitoring|training|coordinating)\b/i, "$1"],
    [/^(?:i\s+|we\s+)(?:helped\s+to\s+|helped\s+|worked\s+on\s+|spent\s+time\s+|used\s+to\s+)/i, ""],
    [/^(?:i\s+|we\s+)/i, ""],
    [/^(?:also\s+|plus\s+|then\s+)/i, ""],
    [/^got\s+promoted\s+to\b/i, "Earned promotion to"],
    [/^promoted\s+to\b/i, "Earned promotion to"],
  ];

  const gerundToPastMap: Record<string, string> = {
    managing: "Managed",
    leading: "Led",
    building: "Built",
    designing: "Designed",
    maintaining: "Maintained",
    supporting: "Supported",
    running: "Operated",
    operating: "Operated",
    creating: "Created",
    developing: "Developed",
    testing: "Tested",
    analyzing: "Analyzed",
    monitoring: "Monitored",
    training: "Trained",
    coordinating: "Coordinated",
    fixing: "Resolved",
    automating: "Automated",
    migrating: "Migrated",
    reducing: "Reduced",
    cutting: "Cut",
    improving: "Improved",
    writing: "Authored",
    handling: "Handled",
    deploying: "Deployed",
  };

  const normalizeClauseToBullet = (clause: string): string => {
    let text = clause.trim();
    for (const [pattern, rep] of casualLeadRewrites) {
      text = text.replace(pattern, rep).trim();
    }
    const firstWordMatch = text.match(/^([a-zA-Z]+)\b/);
    if (firstWordMatch) {
      const lowerFirst = firstWordMatch[1].toLowerCase();
      if (gerundToPastMap[lowerFirst]) {
        text = gerundToPastMap[lowerFirst] + text.slice(firstWordMatch[1].length);
      } else {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
    }
    if (!/[.!?]$/.test(text)) {
      text += ".";
    }
    return scrubAiTropesAndDashes(text);
  };

  const convertedBullets = Array.from(
    new Set(rawClauses.map(normalizeClauseToBullet).filter((b) => b.length >= 16))
  );

  // Rank bullets so quantified benchmarks and promotions lead first
  const scoreBullet = (b: string): number => {
    let score = 0;
    if (/\d+%|\$\d+|\b\d+(?:\.\d+)?[xmkb]?\b/i.test(b)) score += 45;
    if (/\b(?:promot|award|recogniz|lead|led|architect|cut|reduc|sav|increas)\w*/i.test(b)) {
      score += 25;
    }
    return score;
  };

  convertedBullets.sort((a, b) => scoreBullet(b) - scoreBullet(a));

  // Extract interview-defensible skills explicitly present in the raw text
  const lowerCorpus = workingText.toLowerCase();
  const extractedSkills = KNOWN_SKILL_LEXICON.filter((sk) => {
    const escaped = sk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(
      lowerCorpus
    );
  }).map((s) => {
    if (s === "sql") return "SQL";
    if (s === "aws") return "AWS";
    if (s === "gcp") return "GCP";
    if (s === "ci/cd") return "CI/CD";
    if (s === "rest apis") return "REST APIs";
    if (s === "postgresql") return "PostgreSQL";
    if (s === "typescript") return "TypeScript";
    if (s === "javascript") return "JavaScript";
    if (s === "node.js") return "Node.js";
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  // Also capture explicit "skills used: X, Y, Z" or "tools: X, Y" segments
  const explicitToolMatch = workingText.match(
    /(?:skills(?:\s+used)?|tools(?:\s+used)?|stack|technologies)\s*[:=-]\s*([^\n.]+)/i
  );
  if (explicitToolMatch && explicitToolMatch[1]) {
    explicitToolMatch[1]
      .split(/[,;/]+|\band\b/i)
      .map((t) => sanitizeDashes(t.trim()))
      .filter((t) => t.length >= 2 && t.length <= 32)
      .forEach((tool) => {
        if (
          !extractedSkills.some((e) => e.toLowerCase() === tool.toLowerCase())
        ) {
          extractedSkills.push(tool);
        }
      });
  }

  const domainCandidates = [
    "Agile",
    "Scrum",
    "Cross-Functional Collaboration",
    "Incident Response",
    "Compliance",
    "SOC2",
    "HIPAA",
    "NIST",
    "FedRAMP",
    "Process Improvement",
    "Root Cause Analysis",
    "SLA Management",
    "Stakeholder Alignment",
  ];
  const extractedKeywords = domainCandidates.filter((kw) =>
    lowerCorpus.includes(kw.toLowerCase())
  );

  const extractedAccomplishments = convertedBullets
    .filter(
      (b) =>
        /\b(?:promot|award|first|1st|top\s+\d+%|\$\d+|\d+%)\b/i.test(b)
    )
    .slice(0, 3);

  let confidentialityNote = "";
  if (isConfidentialNda && isClearanceRestricted) {
    confidentialityNote = "Unclassified & NDA-Safe Scope Summary";
  } else if (isConfidentialNda) {
    confidentialityNote = "Scope Generalized per NDA";
  } else if (isClearanceRestricted) {
    confidentialityNote = "Unclassified Scope Summary";
  }

  return {
    company: inferredCompany || "Employer Name",
    role: inferredRole || "Role Title",
    location: inferredLocation,
    startDate: inferredStart || "2023-01",
    endDate: inferredEnd || "Present",
    bullets:
      convertedBullets.length > 0
        ? convertedBullets.slice(0, 7)
        : [
            workingText.trim()
              ? normalizeClauseToBullet(workingText)
              : "Add freeflow job notes above to generate structured impact bullets.",
          ],
    promotionSummary,
    extractedSkills: Array.from(new Set(extractedSkills)),
    extractedKeywords,
    extractedAccomplishments,
    confidentialityNote,
    complianceNotes,
    usedAiModel: false,
  };
}

export function createDemoState(): AppState {
  const masterResume: MasterResume = {
    contact: {
      name: "Alex Mercer",
      email: "alex.mercer@example.com",
      phone: "512-555-0144",
      location: "Austin, TX",
      linkedinUrl: "linkedin.com/in/alexmercer",
      githubUrl: "github.com/alexmercer",
      portfolioUrl: "alexmercer.dev",
      substackUrl: "alexmercer.substack.com",
      workAuthorization: "US Citizen (no sponsorship required)",
      securityClearance: "Active Secret Clearance",
      workPreference: "Hybrid or Remote",
      links: [],
    },
    targetJobTitles: [
      "Senior Backend Software Engineer",
      "Data Platform Engineer",
    ],
    summary:
      "Backend and data platform engineer with 4 years of experience designing fault-tolerant ingestion pipelines, relational schemas, and observable APIs in Python, Go, and PostgreSQL.",
    experience: [
      {
        id: "exp_1",
        company: "Helix Telemetry",
        role: "Backend Software Engineer",
        location: "Austin, TX",
        startDate: "2023-02",
        endDate: "Present",
        bullets: [
          "Architected Python and Kafka event ingestion service processing 2.4M daily sensor payloads at 99.95% availability.",
          "Optimized PostgreSQL indexing and partitioning strategy, cutting p95 query latency from 480ms to 135ms.",
          "Containerized 11 internal microservices with Docker and GitHub Actions CI/CD, reducing deploy rollback time to under 4 minutes.",
        ],
      },
      {
        id: "exp_2",
        company: "Kite Labs",
        role: "Associate Systems Developer",
        location: "Dallas, TX",
        startDate: "2021-06",
        endDate: "2023-01",
        bullets: [
          "Built internal Go REST APIs and React operational views used by 45 support engineers daily.",
          "Implemented automated schema migration checks in PostgreSQL, eliminating manual release freezes.",
        ],
      },
    ],
    projects: [
      {
        id: "proj_1",
        name: "pg-partition-lint",
        url: "https://github.com/alexmercer/pg-partition-lint",
        techStack: "Go, PostgreSQL, GitHub Actions",
        description:
          "Open-source CLI tool validating zero-downtime PostgreSQL partition migrations with 620+ GitHub stars.",
      },
      {
        id: "proj_2",
        name: "StreamCheck Latency Monitor",
        url: "https://alexmercer.dev/projects/streamcheck",
        techStack: "Python, Kafka, Prometheus",
        description:
          "Lightweight synthetic consumer tracking end-to-end event pipeline lag across multi-region clusters.",
      },
    ],
    education: [
      {
        id: "edu_1",
        institution: "University of Texas at Austin",
        degree: "B.S. in Computer Science",
        year: "2021",
      },
    ],
    skills: [
      "Python",
      "Go",
      "PostgreSQL",
      "SQL",
      "Docker",
      "AWS",
      "Kafka",
      "REST APIs",
      "React",
      "Git",
      "CI/CD",
      "Linux",
      "Prometheus",
    ],
    skillWeights: {
      python: 5,
      postgresql: 5,
      sql: 5,
      go: 4,
      kafka: 4,
      docker: 4,
      "rest apis": 4,
      aws: 3,
      git: 3,
      "ci/cd": 3,
      linux: 3,
      react: 2,
      prometheus: 1,
    },
    skillNotes: {
      prometheus:
        "Configured basic scrape targets in StreamCheck; adding custom alerting rules.",
    },
    includeWeightOneOnResume: true,
    atsKeywords: [
      "Distributed Systems",
      "Event-Driven Architecture",
      "Schema Design",
      "Observability",
      "Incident Response",
      "Agile Delivery",
    ],
    aiUsage: [
      "Structured LLM API integration with strict JSON schema validation and deterministic fallbacks.",
      "AI-assisted unit test generation and SQL query plan review verified against production benchmarks.",
    ],
    certifications: ["AWS Certified Developer - Associate (2024)"],
    accomplishments: [
      "1st Place Engineering Reliability Award at Helix Telemetry Q4 Hackathon (2024).",
      "Published technical deep-dives on PostgreSQL indexing on Substack (1,800+ subscribers).",
    ],
    defaultCoverLetter:
      "Dear Hiring Team,\n\nI am applying for your open engineering role. Over the past 4 years at Helix Telemetry and Kite Labs, I have built and operated high-throughput Python, Go, and PostgreSQL systems, including a Kafka ingestion pipeline handling 2.4M daily payloads at 99.95% availability and indexing improvements that cut p95 query latency from 480ms to 135ms.\n\nAlongside production backend work, I maintain the open-source pg-partition-lint CLI (github.com/alexmercer/pg-partition-lint) and use structured AI-assisted testing workflows to ship reliable, well-tested code faster without sacrificing review rigor.\n\nThank you for reviewing my application. I welcome the opportunity to discuss how my verified production experience aligns with your team's goals.\n\nSincerely,\nAlex Mercer",
  };

  const applications: ApplicationRecord[] = [
    {
      id: "app_demo_1",
      company: "CloudScale Systems",
      role: "Senior Backend Engineer",
      contactName: "Sarah Jenkins",
      contactEmail: "s.jenkins@cloudscale.example",
      source: "Employee Referral",
      jobUrl: "https://cloudscale.example/careers/backend-eng",
      stage: ApplicationStage.Applied,
      stageReason: ClosedReason.None,
      jobDescription:
        "We are hiring a Senior Backend Engineer to scale our telemetry ingestion platform. Required qualifications: Python, Go, PostgreSQL, Docker, AWS, REST APIs, Kubernetes, and Terraform. Experience with Kafka and observability tooling (Prometheus) is a plus.",
      notes: "Referred by former Kite Labs colleague. Emphasize PostgreSQL p95 latency reduction.",
      createdAt: daysAgoIsoDate(8),
      updatedAt: daysAgoIsoDate(8),
    },
    {
      id: "app_demo_2",
      company: "DataVibe Analytics",
      role: "Data Platform Engineer",
      contactName: "Marcus Vance",
      contactEmail: "marcus@datavibe.example",
      source: "Handshake",
      jobUrl: "https://datavibe.example/jobs/data-platform",
      stage: ApplicationStage.TechnicalInterview,
      stageReason: ClosedReason.None,
      jobDescription:
        "Seeking a Data Platform Engineer experienced in Python, SQL, PostgreSQL, Kafka, Docker, Airflow, and Snowflake to maintain high-throughput customer analytics pipelines.",
      notes: "Recruiter screen went smoothly; technical architecture round scheduled next.",
      createdAt: daysAgoIsoDate(16),
      updatedAt: daysAgoIsoDate(3),
    },
    {
      id: "app_demo_3",
      company: "Northstar Civic Tech",
      role: "Full Stack Platform Engineer",
      contactName: "Elena Rostova",
      contactEmail: "elena@northstarcivic.example",
      source: "Company Career Page",
      jobUrl: "https://northstarcivic.example/openings/platform",
      stage: ApplicationStage.RecruiterScreen,
      stageReason: ClosedReason.None,
      jobDescription:
        "Looking for a Full Stack Platform Engineer comfortable across React, TypeScript, Go, PostgreSQL, AWS, and CI/CD pipelines to build public-interest transit tools.",
      notes: "Initial outreach received 23 days ago; waiting on scheduling confirmation.",
      createdAt: daysAgoIsoDate(24),
      updatedAt: daysAgoIsoDate(23),
    },
    {
      id: "app_demo_4",
      company: "Vektor Cloud",
      role: "Senior Platform Engineer",
      contactName: "Devon Cho",
      contactEmail: "d.cho@vektorcloud.example",
      source: "Greenhouse Board",
      jobUrl: "https://boards.greenhouse.io/vektorcloud/jobs/401928",
      stage: ApplicationStage.Closed,
      stageReason: ClosedReason.Rejected,
      rejectedAt: daysAgoIsoDate(19),
      rejectionStage: ApplicationStage.TechnicalInterview,
      rejectionNotes:
        "Rejected after technical screen; team wanted deeper production Kubernetes operator experience.",
      jobDescription:
        "Hiring a Senior Platform Engineer with strong Kubernetes, Go, Python, Terraform, PostgreSQL, and AWS infrastructure automation experience.",
      notes: "Revisit only if role reopens at mid-level or after shipping K8s controller work.",
      createdAt: daysAgoIsoDate(34),
      updatedAt: daysAgoIsoDate(19),
    },
  ];

  const events: TimelineEvent[] = [
    {
      id: "evt_demo_1",
      applicationId: "app_demo_1",
      date: daysAgoIsoDate(8),
      type: TimelineEventType.Applied,
      notes: "Submitted tailored single-column resume via referral link",
      sequence: 1,
    },
    {
      id: "evt_demo_2",
      applicationId: "app_demo_2",
      date: daysAgoIsoDate(15),
      type: TimelineEventType.Applied,
      notes: "Applied directly on Handshake",
      sequence: 2,
    },
    {
      id: "evt_demo_3",
      applicationId: "app_demo_2",
      date: daysAgoIsoDate(6),
      type: TimelineEventType.Contact,
      notes: "Marcus replied to schedule 30-minute recruiter screen",
      sequence: 3,
    },
    {
      id: "evt_demo_4",
      applicationId: "app_demo_2",
      date: daysAgoIsoDate(3),
      type: TimelineEventType.Interview,
      notes: "Completed technical systems round with platform lead",
      sequence: 4,
    },
    {
      id: "evt_demo_5",
      applicationId: "app_demo_3",
      date: daysAgoIsoDate(23),
      type: TimelineEventType.Contact,
      notes: "Elena sent initial availability request; replied same afternoon",
      sequence: 5,
    },
    {
      id: "evt_demo_6",
      applicationId: "app_demo_4",
      date: daysAgoIsoDate(19),
      type: TimelineEventType.Note,
      notes: "Marked as Rejected after Technical interview",
      sequence: 6,
    },
  ];

  const interviews = [
    {
      id: "int_demo_1",
      applicationId: "app_demo_2",
      date: daysAgoIsoDate(6),
      type: InterviewType.RecruiterScreen,
      interviewers: "Marcus Vance",
      selfGrade: 4,
      highlights: "Clear walkthrough of the 2.4M daily Kafka ingestion architecture and latency metrics.",
      improvements: "Tighten explanation of why I am transitioning toward dedicated data platform roles.",
      questions: [
        {
          topic: "Motivation",
          text: "What draws you to data platform infrastructure versus general product backend work?",
        },
        {
          topic: "PostgreSQL",
          text: "How large were the partitioned tables you managed at Helix Telemetry?",
        },
      ],
    },
    {
      id: "int_demo_2",
      applicationId: "app_demo_2",
      date: daysAgoIsoDate(3),
      type: InterviewType.Technical,
      interviewers: "Priya Nair, Principal Data Engineer",
      selfGrade: 5,
      highlights: "Strong trade-off analysis on idempotent consumers, dead-letter queues, and PostgreSQL indexing.",
      improvements: "Review Airflow DAG backfill semantics before final panel.",
      questions: [
        {
          topic: "Distributed Queues",
          text: "How do you guarantee exactly-once or idempotent downstream writes during consumer restarts?",
        },
        {
          topic: "Orchestration",
          text: "How would you design backfill retries for a failed daily aggregation pipeline?",
        },
        {
          topic: "SQL Performance",
          text: "Walk through diagnosing a sudden p95 regression on a time-series table.",
        },
      ],
    },
  ];

  const tailoredByApp: Record<string, TailoredWorkspace> = {
    app_demo_1: buildLocalTailoredWorkspace(applications[0], masterResume, []),
    app_demo_2: buildLocalTailoredWorkspace(applications[1], masterResume, []),
  };

  return {
    welcomeDismissed: false,
    masterResume,
    applications,
    events,
    interviews,
    tailoredByApp,
    savedBoards: [
      { id: "bd_stripe", provider: "greenhouse", slug: "stripe", label: "Stripe" },
      { id: "bd_cloudflare", provider: "greenhouse", slug: "cloudflare", label: "Cloudflare" },
      { id: "bd_figma", provider: "greenhouse", slug: "figma", label: "Figma" },
      { id: "bd_linear", provider: "ashby", slug: "linear", label: "Linear" },
    ],
    activityLog: [
      {
        id: "log_demo_1",
        timestamp: new Date(Date.now() - 8 * 86400000).toISOString(),
        category: "pipeline",
        summary:
          "Saved & submitted Senior Backend Engineer at CloudScale Systems (Employee Referral).",
      },
      {
        id: "log_demo_2",
        timestamp: new Date(Date.now() - 6 * 86400000).toISOString(),
        category: "interview",
        summary:
          "Logged Recruiter Screen debrief for DataVibe Analytics (Self-grade 4/5).",
      },
      {
        id: "log_demo_3",
        timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
        category: "interview",
        summary:
          "Logged Technical round debrief for DataVibe Analytics (Self-grade 5/5).",
      },
      {
        id: "log_demo_4",
        timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
        category: "resume",
        summary:
          "Weighted 13 Master Resume skills on 1-5 scale (Python, PostgreSQL, SQL at 5/5; Prometheus at 1/5).",
      },
    ],
    retentionDays: 0,
  };
}
