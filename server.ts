import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BANNED_PHRASES = [
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

function stripLongDashes(text: string): string {
  if (!text) return "";
  return text.replace(/[\u2014\u2013]/g, "-");
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtmlTags(html: string): string {
  return stripLongDashes(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim()
  );
}

interface NormalizedBoardJob {
  externalId: string;
  boardSource: string;
  company: string;
  role: string;
  location: string;
  department: string;
  jobUrl: string;
  publishedAt: string;
  jobDescription: string;
}

async function fetchRemotiveJobs(
  query: string,
  limit = 20
): Promise<NormalizedBoardJob[]> {
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(
    query || "software"
  )}&limit=${limit}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) throw new Error(`Remotive HTTP ${resp.status}`);
  const data = (await resp.json()) as {
    jobs?: Array<{
      id: number;
      title: string;
      company_name: string;
      candidate_required_location: string;
      category: string;
      url: string;
      publication_date: string;
      description: string;
    }>;
  };
  return (data.jobs || []).slice(0, limit).map((j) => ({
    externalId: `remotive_${j.id}`,
    boardSource: "Remotive",
    company: stripLongDashes(j.company_name || "Unknown Company"),
    role: stripLongDashes(j.title || "Open Role"),
    location: stripLongDashes(j.candidate_required_location || "Remote"),
    department: stripLongDashes(j.category || "General"),
    jobUrl: j.url || "",
    publishedAt: (j.publication_date || "").split("T")[0] || "",
    jobDescription: stripHtmlTags(j.description || "").slice(0, 6000),
  }));
}

async function fetchArbeitnowJobs(
  query: string,
  limit = 20
): Promise<NormalizedBoardJob[]> {
  const resp = await fetch("https://www.arbeitnow.com/api/job-board-api", {
    signal: AbortSignal.timeout(9000),
  });
  if (!resp.ok) throw new Error(`Arbeitnow HTTP ${resp.status}`);
  const data = (await resp.json()) as {
    data?: Array<{
      slug: string;
      company_name: string;
      title: string;
      description: string;
      remote: boolean;
      url: string;
      tags: string[];
      location: string;
      created_at: number;
    }>;
  };
  const q = (query || "").trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const filtered = (data.data || []).filter((item) => {
    if (terms.length === 0) return true;
    const hay = `${item.title} ${item.company_name} ${(item.tags || []).join(" ")} ${item.location}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });

  return filtered.slice(0, limit).map((j) => ({
    externalId: `arbeitnow_${j.slug}`,
    boardSource: "Arbeitnow",
    company: stripLongDashes(j.company_name || "Unknown Company"),
    role: stripLongDashes(j.title || "Open Role"),
    location: stripLongDashes(
      j.remote ? `${j.location || "Global"} (Remote)` : j.location || "On-site"
    ),
    department: stripLongDashes((j.tags || []).slice(0, 2).join(", ") || "Engineering"),
    jobUrl: j.url || "",
    publishedAt: j.created_at
      ? new Date(j.created_at * 1000).toISOString().split("T")[0]
      : "",
    jobDescription: stripHtmlTags(j.description || "").slice(0, 6000),
  }));
}

async function fetchTheMuseJobs(
  query: string,
  location: string,
  limit = 20
): Promise<NormalizedBoardJob[]> {
  const params = new URLSearchParams({ page: "1" });
  if (location.trim()) {
    params.append("location", location.trim());
  }
  const resp = await fetch(
    `https://www.themuse.com/api/public/jobs?${params.toString()}`,
    { signal: AbortSignal.timeout(9000) }
  );
  if (!resp.ok) throw new Error(`The Muse HTTP ${resp.status}`);
  const data = (await resp.json()) as {
    results?: Array<{
      id: number;
      name: string;
      contents: string;
      publication_date: string;
      locations?: Array<{ name: string }>;
      categories?: Array<{ name: string }>;
      company?: { name: string };
      refs?: { landing_page: string };
    }>;
  };
  const q = (query || "").trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const items = (data.results || []).filter((r) => {
    if (terms.length === 0) return true;
    const hay = `${r.name} ${r.company?.name || ""} ${(r.categories || [])
      .map((c) => c.name)
      .join(" ")}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });

  return items.slice(0, limit).map((j) => ({
    externalId: `themuse_${j.id}`,
    boardSource: "The Muse",
    company: stripLongDashes(j.company?.name || "Unknown Company"),
    role: stripLongDashes(j.name || "Open Role"),
    location: stripLongDashes(
      (j.locations || []).map((l) => l.name).join(", ") || "Flexible"
    ),
    department: stripLongDashes(
      (j.categories || []).map((c) => c.name).join(", ") || "General"
    ),
    jobUrl: j.refs?.landing_page || "",
    publishedAt: (j.publication_date || "").split("T")[0] || "",
    jobDescription: stripHtmlTags(j.contents || "").slice(0, 6000),
  }));
}

async function fetchGreenhouseBoard(
  boardSlug: string,
  query = ""
): Promise<NormalizedBoardJob[]> {
  const cleanSlug = boardSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!cleanSlug) return [];
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    cleanSlug
  )}/jobs?content=true`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) {
    throw new Error(`Greenhouse board '${cleanSlug}' returned HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as {
    jobs?: Array<{
      id: number;
      title: string;
      updated_at: string;
      absolute_url: string;
      content: string;
      location?: { name: string };
      departments?: Array<{ name: string }>;
    }>;
  };
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const companyLabel =
    cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);

  return (data.jobs || [])
    .filter((j) => {
      if (terms.length === 0) return true;
      const hay = `${j.title} ${j.location?.name || ""} ${(j.departments || [])
        .map((d) => d.name)
        .join(" ")}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .slice(0, 40)
    .map((j) => ({
      externalId: `gh_${cleanSlug}_${j.id}`,
      boardSource: `Greenhouse (${cleanSlug})`,
      company: companyLabel,
      role: stripLongDashes(j.title || "Open Role"),
      location: stripLongDashes(j.location?.name || "Unspecified"),
      department: stripLongDashes(
        (j.departments || []).map((d) => d.name).join(", ") || "General"
      ),
      jobUrl: j.absolute_url || "",
      publishedAt: (j.updated_at || "").split("T")[0] || "",
      jobDescription: stripHtmlTags(j.content || "").slice(0, 6000),
    }));
}

async function fetchLeverBoard(
  boardSlug: string,
  query = ""
): Promise<NormalizedBoardJob[]> {
  const cleanSlug = boardSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!cleanSlug) return [];
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
    cleanSlug
  )}?mode=json`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) {
    throw new Error(`Lever board '${cleanSlug}' returned HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as Array<{
    id: string;
    text: string;
    hostedUrl: string;
    createdAt: number;
    descriptionPlain?: string;
    description?: string;
    lists?: Array<{ text: string; content: string }>;
    categories?: {
      location?: string;
      team?: string;
      department?: string;
    };
  }>;

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const companyLabel =
    cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);

  return (Array.isArray(data) ? data : [])
    .filter((j) => {
      if (terms.length === 0) return true;
      const hay = `${j.text} ${j.categories?.location || ""} ${
        j.categories?.team || ""
      }`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .slice(0, 40)
    .map((j) => {
      const listContent = (j.lists || [])
        .map((l) => `${l.text}:\n${stripHtmlTags(l.content)}`)
        .join("\n\n");
      const fullDesc = [
        j.descriptionPlain || stripHtmlTags(j.description || ""),
        listContent,
      ]
        .filter(Boolean)
        .join("\n\n");

      return {
        externalId: `lever_${cleanSlug}_${j.id}`,
        boardSource: `Lever (${cleanSlug})`,
        company: companyLabel,
        role: stripLongDashes(j.text || "Open Role"),
        location: stripLongDashes(j.categories?.location || "Unspecified"),
        department: stripLongDashes(
          j.categories?.team || j.categories?.department || "General"
        ),
        jobUrl: j.hostedUrl || "",
        publishedAt: j.createdAt
          ? new Date(j.createdAt).toISOString().split("T")[0]
          : "",
        jobDescription: stripLongDashes(fullDesc).slice(0, 6000),
      };
    });
}

async function fetchAshbyBoard(
  boardSlug: string,
  query = ""
): Promise<NormalizedBoardJob[]> {
  const cleanSlug = boardSlug.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  if (!cleanSlug) return [];
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    cleanSlug
  )}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) {
    throw new Error(`Ashby board '${cleanSlug}' returned HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as {
    jobs?: Array<{
      id: string;
      title: string;
      location: string;
      department: string;
      jobUrl: string;
      publishedAt: string;
      descriptionPlain?: string;
      descriptionHtml?: string;
    }>;
  };

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const companyLabel =
    cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);

  return (data.jobs || [])
    .filter((j) => {
      if (terms.length === 0) return true;
      const hay = `${j.title} ${j.location || ""} ${j.department || ""}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .slice(0, 40)
    .map((j) => ({
      externalId: `ashby_${cleanSlug}_${j.id}`,
      boardSource: `Ashby (${cleanSlug})`,
      company: companyLabel,
      role: stripLongDashes(j.title || "Open Role"),
      location: stripLongDashes(j.location || "Unspecified"),
      department: stripLongDashes(j.department || "General"),
      jobUrl: j.jobUrl || "",
      publishedAt: (j.publishedAt || "").split("T")[0] || "",
      jobDescription: stripLongDashes(
        j.descriptionPlain || stripHtmlTags(j.descriptionHtml || "")
      ).slice(0, 6000),
    }));
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
    );
    res.json({ ok: true, aiAvailable: hasKey });
  });

  // 1. Live Multi-Board Job Search & ATS Board Connector
  app.post("/api/jobs/search", async (req, res) => {
    const {
      query = "",
      location = "",
      sources = ["remotive", "arbeitnow", "themuse"],
      atsProvider = "",
      atsSlug = "",
    } = req.body || {};

    const tasks: Array<Promise<NormalizedBoardJob[]>> = [];
    const warnings: string[] = [];

    if (atsProvider && atsSlug) {
      if (atsProvider === "greenhouse") {
        tasks.push(
          fetchGreenhouseBoard(atsSlug, query).catch((e: Error) => {
            warnings.push(e.message);
            return [];
          })
        );
      } else if (atsProvider === "lever") {
        tasks.push(
          fetchLeverBoard(atsSlug, query).catch((e: Error) => {
            warnings.push(e.message);
            return [];
          })
        );
      } else if (atsProvider === "ashby") {
        tasks.push(
          fetchAshbyBoard(atsSlug, query).catch((e: Error) => {
            warnings.push(e.message);
            return [];
          })
        );
      }
    } else {
      if (sources.includes("remotive")) {
        tasks.push(
          fetchRemotiveJobs(query, 18).catch((e: Error) => {
            warnings.push(`Remotive: ${e.message}`);
            return [];
          })
        );
      }
      if (sources.includes("arbeitnow")) {
        tasks.push(
          fetchArbeitnowJobs(query, 18).catch((e: Error) => {
            warnings.push(`Arbeitnow: ${e.message}`);
            return [];
          })
        );
      }
      if (sources.includes("themuse")) {
        tasks.push(
          fetchTheMuseJobs(query, location, 18).catch((e: Error) => {
            warnings.push(`The Muse: ${e.message}`);
            return [];
          })
        );
      }
    }

    const settled = await Promise.all(tasks);
    let combined = settled.flat();

    if (location.trim()) {
      const locLower = location.trim().toLowerCase();
      combined = combined.filter(
        (j) =>
          j.location.toLowerCase().includes(locLower) ||
          (locLower === "remote" && j.location.toLowerCase().includes("remote"))
      );
    }

    res.json({
      jobs: combined.slice(0, 60),
      warnings: warnings.map(stripLongDashes),
    });
  });

  // 2. Gemini Google-Search-Grounded Live Job Discovery across major job boards
  app.post("/api/jobs/web-search", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "Gemini API key not configured. Use the Live Public Job Boards search or Quick-Launch Board Links.",
      });
      return;
    }

    const { query = "", location = "", boardFilter = "" } = req.body || {};
    if (!query.trim()) {
      res.status(400).json({ error: "Enter a job title or skill query first." });
      return;
    }

    try {
      const boardClause = boardFilter
        ? `Focus on job postings hosted on ${boardFilter} (such as Handshake, LinkedIn, Greenhouse, Lever, Ashby, Indeed, or Wellfound).`
        : "Search across major job boards (Greenhouse, Lever, Ashby, LinkedIn, Handshake, Wellfound, and company career pages).";

      const prompt = [
        `Find current, real open job postings matching: "${query.trim()}"`,
        location.trim() ? `Preferred location: "${location.trim()}".` : "",
        boardClause,
        "For each role found, summarize the company, exact job title, location, key technical or domain requirements, and reference the source posting.",
        "Do not invent postings. Do not use em dashes or en dashes; use hyphens or commas.",
      ]
        .filter(Boolean)
        .join(" ");

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks
        .map((c: { web?: { uri?: string; title?: string } }) => ({
          uri: c.web?.uri || "",
          title: stripLongDashes(c.web?.title || "Job Board Source"),
        }))
        .filter((s: { uri: string }) => Boolean(s.uri));

      res.json({
        summary: stripLongDashes(response.text || ""),
        sources,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Web job search failed.";
      res.status(500).json({ error: stripLongDashes(msg) });
    }
  });

  // 3. Import a Single Job Posting Directly by URL (Greenhouse/Lever/Ashby API + Gemini URL Context + HTML fallback)
  app.post("/api/jobs/import-url", async (req, res) => {
    const { url = "" } = req.body || {};
    const targetUrl = String(url).trim();
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      res.status(400).json({ error: "Enter a valid http:// or https:// job URL." });
      return;
    }

    try {
      // Check direct Greenhouse URL pattern: boards.greenhouse.io/<slug>/jobs/<id> or job-boards.greenhouse.io/<slug>/jobs/<id>
      const ghMatch = targetUrl.match(
        /greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i
      );
      if (ghMatch) {
        const [, slug, jobId] = ghMatch;
        const apiResp = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
            slug
          )}/jobs/${encodeURIComponent(jobId)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (apiResp.ok) {
          const j = (await apiResp.json()) as {
            title?: string;
            content?: string;
            location?: { name?: string };
          };
          res.json({
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            role: stripLongDashes(j.title || "Imported Role"),
            location: stripLongDashes(j.location?.name || ""),
            source: "Greenhouse",
            jobUrl: targetUrl,
            jobDescription: stripHtmlTags(j.content || "").slice(0, 8000),
          });
          return;
        }
      }

      // Check direct Lever URL pattern: jobs.lever.co/<slug>/<uuid>
      const leverMatch = targetUrl.match(
        /jobs\.lever\.co\/([^/?#]+)\/([a-f0-9-]{10,})/i
      );
      if (leverMatch) {
        const [, slug, postingId] = leverMatch;
        const apiResp = await fetch(
          `https://api.lever.co/v0/postings/${encodeURIComponent(
            slug
          )}/${encodeURIComponent(postingId)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (apiResp.ok) {
          const j = (await apiResp.json()) as {
            text?: string;
            descriptionPlain?: string;
            description?: string;
            lists?: Array<{ text: string; content: string }>;
            categories?: { location?: string };
          };
          const extra = (j.lists || [])
            .map((l) => `${l.text}:\n${stripHtmlTags(l.content)}`)
            .join("\n\n");
          res.json({
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            role: stripLongDashes(j.text || "Imported Role"),
            location: stripLongDashes(j.categories?.location || ""),
            source: "Lever",
            jobUrl: targetUrl,
            jobDescription: stripLongDashes(
              [j.descriptionPlain || stripHtmlTags(j.description || ""), extra]
                .filter(Boolean)
                .join("\n\n")
            ).slice(0, 8000),
          });
          return;
        }
      }

      // Try direct HTML fetch and clean extraction
      let rawText = "";
      let pageTitle = "";
      try {
        const htmlResp = await fetch(targetUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; JobSearchCommandCenter/1.0)",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (htmlResp.ok) {
          const html = await htmlResp.text();
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          pageTitle = titleMatch ? stripHtmlTags(titleMatch[1]) : "";
          rawText = stripHtmlTags(html).slice(0, 12000);
        }
      } catch {
        // Proceed to Gemini urlContext if direct fetch is blocked
      }

      const ai = getGeminiClient();
      if (ai) {
        if (rawText.length > 200) {
          const parsedResp = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: `Extract the exact job details from this job posting webpage text (URL: ${targetUrl}, Title: ${pageTitle}). Never invent facts. Do not use em dashes.\n\n${rawText}`,
            config: {
              temperature: 0.1,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  company: { type: Type.STRING },
                  role: { type: Type.STRING },
                  location: { type: Type.STRING },
                  source: { type: Type.STRING },
                  jobDescription: { type: Type.STRING },
                },
                required: [
                  "company",
                  "role",
                  "location",
                  "source",
                  "jobDescription",
                ],
              },
            },
          });
          const parsed = JSON.parse(stripLongDashes(parsedResp.text || "{}"));
          res.json({
            company: stripLongDashes(parsed.company || "Unknown Company"),
            role: stripLongDashes(parsed.role || pageTitle || "Imported Role"),
            location: stripLongDashes(parsed.location || ""),
            source: stripLongDashes(parsed.source || new URL(targetUrl).hostname),
            jobUrl: targetUrl,
            jobDescription: stripLongDashes(parsed.jobDescription || rawText).slice(
              0,
              8000
            ),
          });
          return;
        } else {
          // Use Gemini urlContext tool when direct fetch returned minimal SPA shell
          const urlResp = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: `Read the job posting at ${targetUrl} and return the company name, role title, location, and full requirements/responsibilities in plain text without em dashes.`,
            config: {
              tools: [{ urlContext: {} }],
            },
          });
          const extracted = stripLongDashes(urlResp.text || "");
          res.json({
            company: new URL(targetUrl).hostname.replace(/^www\./, ""),
            role: pageTitle || "Imported Role",
            location: "",
            source: new URL(targetUrl).hostname.replace(/^www\./, ""),
            jobUrl: targetUrl,
            jobDescription: extracted,
          });
          return;
        }
      }

      if (rawText.length > 80) {
        res.json({
          company: new URL(targetUrl).hostname.replace(/^www\./, ""),
          role: pageTitle || "Imported Role",
          location: "",
          source: new URL(targetUrl).hostname.replace(/^www\./, ""),
          jobUrl: targetUrl,
          jobDescription: rawText.slice(0, 8000),
        });
        return;
      }

      res.status(422).json({
        error:
          "This job board blocks automated page reads (login wall or anti-bot protection). Copy and paste the job text directly into the Pipeline or Match Studio.",
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not import job URL.";
      res.status(500).json({ error: stripLongDashes(msg) });
    }
  });

  // 4. Grounded Gemini Resume Tailoring
  app.post("/api/tailor", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "Gemini API key not configured on server. Using deterministic local analysis.",
      });
      return;
    }

    const {
      masterResume,
      jobDescription,
      role,
      company,
      confirmedSkills,
      applicantOrgNote = "",
    } = req.body;
    if (!masterResume || !jobDescription) {
      res
        .status(400)
        .json({ error: "masterResume and jobDescription are required." });
      return;
    }

    try {
      const systemInstruction = [
        "You are a truthful, rigorous resume tailoring analyst and plain-spoken executive cover letter writer.",
        "STRICT RULES:",
        "1. NEVER fabricate experience, metrics, skills, titles, employers, projects, or dates. Use the Master Resume as the sole factual template.",
        "2. Every tailored bullet MUST derive strictly from the provided Master Resume bullets or user-confirmed skills.",
        "3. If a proposed bullet introduces any metric, tool, or claim not explicitly supported by the Master Resume or confirmedSkills, set ungroundedWarning to a specific explanation of what is unverified; otherwise set ungroundedWarning to an empty string.",
        "4. NEVER use em dashes or en dashes anywhere in your output. Use commas, colons, parentheses, or standard hyphens (-).",
        `5. NEVER use common AI writing tropes or cliches, including: ${BANNED_PHRASES.join(", ")}. Write in crisp, direct, natural human prose.`,
        "6. Write a tailored coverLetter to the business (180 to 260 words) structured around four explicit elements:",
        "   a) Why they should hire me: open directly on the business problem their role solves and why I can deliver immediately.",
        "   b) What I bring: concrete, interview-defensible skills, domain knowledge, and practical workflows from my Master Resume.",
        "   c) Things I have done that make me the strongest qualified candidate: specific quantified accomplishments, shipped work, or projects verbatim from my Master Resume.",
        "   d) How I fit their organization: tie directly to the company's priorities, product, or culture in the Job Description (and applicantOrgNote if provided).",
        "7. CONFIDENTIALITY & SECURITY CLEARANCE GUARDRAIL: If any experience role is marked isConfidentialNda or isClearanceRestricted, strictly preserve NDA/clearance boundaries (never introduce sensitive client names, internal codenames, or classified program details). Mention security clearance status factually when relevant.",
      ].join("\n");

      const sanitizedMasterForTailor = {
        ...masterResume,
        experience: Array.isArray(masterResume.experience)
          ? masterResume.experience.map(
              ({ rawBrainstorm: _rb, ...publicRole }: Record<string, unknown>) =>
                publicRole
            )
          : [],
      };

      const prompt = JSON.stringify({
        targetCompany: company || "Target Company",
        targetRole: role || "Target Role",
        confirmedExtraSkills: confirmedSkills || [],
        applicantOrgNote: stripLongDashes(String(applicantOrgNote || "")),
        masterResume: sanitizedMasterForTailor,
        jobDescription,
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              requiredSkillsFound: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Required skills from the job description that are explicitly present in the Master Resume or confirmedExtraSkills.",
              },
              missingSkillsToConfirm: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Skills mentioned in the job description that are plausible adjacent tools the candidate might know and can click to confirm.",
              },
              missingSkillsLearningOnly: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Specialized domain or qualification requirements missing from the Master Resume that should stay in learning-only and never be added without proof.",
              },
              matchScore: {
                type: Type.INTEGER,
                description: "Realistic alignment score from 0 to 100.",
              },
              tailoredBullets: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    experienceId: { type: Type.STRING },
                    bulletIndex: { type: Type.INTEGER },
                    originalBullet: { type: Type.STRING },
                    tailoredBullet: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    ungroundedWarning: { type: Type.STRING },
                  },
                  required: [
                    "experienceId",
                    "bulletIndex",
                    "originalBullet",
                    "tailoredBullet",
                    "rationale",
                    "ungroundedWarning",
                  ],
                },
              },
              coverLetter: {
                type: Type.STRING,
                description:
                  "Direct first-person cover letter under 260 words with zero banned phrases and zero long dashes.",
              },
              managerFlags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Honest hiring-manager observations (e.g., date gaps, missing domain proof, strong quantified impact).",
              },
            },
            required: [
              "requiredSkillsFound",
              "missingSkillsToConfirm",
              "missingSkillsLearningOnly",
              "matchScore",
              "tailoredBullets",
              "coverLetter",
              "managerFlags",
            ],
          },
        },
      });

      const rawText = response.text || "{}";
      const parsed = JSON.parse(stripLongDashes(rawText));
      res.json(parsed);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to run Gemini tailoring analysis.";
      res.status(500).json({ error: stripLongDashes(message) });
    }
  });

  // 4b. Dedicated 4-Pillar Grounded Cover Letter Generator (AI)
  app.post("/api/cover-letter/generate", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "Gemini API key not configured. Generated deterministic 4-pillar cover letter locally.",
      });
      return;
    }

    const {
      masterResume,
      jobDescription = "",
      role = "",
      company = "",
      confirmedSkills = [],
      applicantOrgNote = "",
      contactName = "",
    } = req.body || {};

    if (!masterResume) {
      res.status(400).json({ error: "masterResume is required." });
      return;
    }

    try {
      const systemInstruction = [
        "You write grounded, plain-spoken, persuasive cover letters for real job applicants.",
        "STRICT RULES:",
        "- NEVER invent metrics, employers, job titles, degrees, projects, or skills. Every factual claim MUST come from the provided Master Resume or confirmedSkills.",
        "- NEVER use em dashes or en dashes anywhere. Use standard hyphens (-), commas, or periods.",
        `- NEVER use common AI writing tropes or cliches (${BANNED_PHRASES.join(", ")}). Sound like a thoughtful, competent human professional.`,
        "- Keep total length between 180 and 265 words across 3 to 4 crisp paragraphs.",
        "- Explicitly cover all 4 pillars:",
        "  1. Why they should hire me (direct opening tied to the target role and business need).",
        "  2. What I bring (interview-defensible skills, domain expertise, and practical workflows).",
        "  3. Things I have done that make me the strongest qualified candidate (concrete quantified achievements and projects from the Master Resume).",
        "  4. How I am a fit in their organization (specific connection to the company's priorities in the Job Description and applicantOrgNote).",
        "- Respect NDA and Security Clearance boundaries on any role marked isConfidentialNda or isClearanceRestricted; highlight active security clearance factually when relevant to the role.",
      ].join("\n");

      const sanitizedMasterForLetter = {
        ...masterResume,
        experience: Array.isArray(masterResume.experience)
          ? masterResume.experience.map(
              ({ rawBrainstorm: _rb, ...publicRole }: Record<string, unknown>) =>
                publicRole
            )
          : [],
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: JSON.stringify({
          targetCompany: company || "Hiring Organization",
          targetRole: role || "Open Position",
          hiringContactName: contactName || "",
          confirmedSkills,
          applicantOrgNote: stripLongDashes(String(applicantOrgNote || "")),
          masterResume: sanitizedMasterForLetter,
          jobDescription: stripLongDashes(String(jobDescription || "")),
        }),
        config: {
          systemInstruction,
          temperature: 0.25,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              coverLetter: { type: Type.STRING },
            },
            required: ["coverLetter"],
          },
        },
      });

      const parsed = JSON.parse(stripLongDashes(response.text || "{}"));
      res.json({
        coverLetter: stripLongDashes(parsed.coverLetter || ""),
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate cover letter.";
      res.status(500).json({ error: stripLongDashes(msg) });
    }
  });

  // 5. AI Resume Evaluator: ATS Pre-Fill Compatibility & Hiring-Manager Impact-First Ordering
  app.post("/api/resume/evaluate", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "Gemini API key not configured. Running deterministic ATS & Hiring-Manager evaluation.",
      });
      return;
    }

    const { masterResume, targetRoleHint = "" } = req.body || {};
    if (!masterResume) {
      res.status(400).json({ error: "masterResume is required." });
      return;
    }

    try {
      const systemInstruction = [
        "You are an expert ATS (Applicant Tracking System) form-autofill architect and Hiring Manager resume reviewer.",
        "Evaluate the provided Master Resume on two axes:",
        "1. ATS & Application Pre-Fill Compatibility (Workday, Greenhouse, Lever, Ashby, iCIMS, Taleo): check whether Name, Email, Phone, City/State, URLs, Work Chronology (Company, Title, YYYY-MM dates), and Education extract cleanly into application pre-fill forms without garbled fields.",
        "2. Hiring Manager 6-Second Priority: hiring managers care FIRST about verified business/technical impact, quantified scale/metrics, and core production skills in the top fold and Bullet #1 of each role.",
        "STRICT HONESTY RULES:",
        "- NEVER invent metrics, skills, employers, titles, or dates.",
        "- When reordering bullets for each experience role in reorderedExperience, use ONLY the exact existing bullets from that role, sorted so the strongest quantified or technical proof comes first.",
        "- NEVER use em dashes or en dashes anywhere; use hyphens, commas, or colons.",
        `- NEVER use banned cliches (${BANNED_PHRASES.join(", ")}).`,
      ].join("\n");

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: JSON.stringify({
          targetRoleHint,
          masterResume,
        }),
        config: {
          systemInstruction,
          temperature: 0.15,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              atsCompatibilityScore: {
                type: Type.INTEGER,
                description: "Score from 0 to 100 for ATS & application pre-fill accuracy.",
              },
              hiringManagerReadabilityScore: {
                type: Type.INTEGER,
                description: "Score from 0 to 100 for hiring-manager top-fold clarity and impact-first bullet priority.",
              },
              topFoldHeadline: {
                type: Type.STRING,
                description: "Truthful, high-signal 1-line headline grounded strictly in the Master Resume.",
              },
              autofillFields: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    field: { type: Type.STRING },
                    extractedValue: { type: Type.STRING },
                    status: {
                      type: Type.STRING,
                      description: "Must be Clean, Warning, or Missing",
                    },
                    note: { type: Type.STRING },
                  },
                  required: ["field", "extractedValue", "status", "note"],
                },
              },
              parserFixes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Specific formatting fixes to ensure 100% clean application form pre-fill.",
              },
              hiringManagerPriorities: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Actionable guidance to foreground what hiring managers care about most.",
              },
              reorderedExperience: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    experienceId: { type: Type.STRING },
                    company: { type: Type.STRING },
                    role: { type: Type.STRING },
                    reorderedBullets: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    leadReason: { type: Type.STRING },
                  },
                  required: [
                    "experienceId",
                    "company",
                    "role",
                    "reorderedBullets",
                    "leadReason",
                  ],
                },
              },
            },
            required: [
              "atsCompatibilityScore",
              "hiringManagerReadabilityScore",
              "topFoldHeadline",
              "autofillFields",
              "parserFixes",
              "hiringManagerPriorities",
              "reorderedExperience",
            ],
          },
        },
      });

      const parsed = JSON.parse(stripLongDashes(response.text || "{}"));
      res.json(parsed);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to run AI resume evaluation.";
      res.status(500).json({ error: stripLongDashes(msg) });
    }
  });

  // 6. Upload & Parse Existing Master Resume (.pdf, .docx, .txt, .md, .html, .json, or raw text)
  app.post("/api/resume/parse-upload", async (req, res) => {
    const {
      fileName = "resume.txt",
      mimeType = "text/plain",
      base64Data = "",
      rawText = "",
    } = req.body || {};

    try {
      const lowerName = String(fileName).toLowerCase();
      const lowerMime = String(mimeType).toLowerCase();
      const buffer = base64Data ? Buffer.from(base64Data, "base64") : null;

      // Direct JSON import support (either MasterResume or full AppState backup)
      if (lowerName.endsWith(".json") || lowerMime.includes("json")) {
        const jsonRaw = rawText || (buffer ? buffer.toString("utf-8") : "{}");
        const parsedJson = JSON.parse(stripLongDashes(jsonRaw));
        const candidateResume = parsedJson.masterResume
          ? parsedJson.masterResume
          : parsedJson;
        res.json({
          masterResume: {
            contact: {
              name: stripLongDashes(candidateResume.contact?.name || ""),
              email: stripLongDashes(candidateResume.contact?.email || ""),
              phone: stripLongDashes(candidateResume.contact?.phone || ""),
              location: stripLongDashes(candidateResume.contact?.location || ""),
              linkedinUrl: stripLongDashes(
                candidateResume.contact?.linkedinUrl || ""
              ),
              githubUrl: stripLongDashes(
                candidateResume.contact?.githubUrl || ""
              ),
              portfolioUrl: stripLongDashes(
                candidateResume.contact?.portfolioUrl || ""
              ),
              substackUrl: stripLongDashes(
                candidateResume.contact?.substackUrl || ""
              ),
              workAuthorization: stripLongDashes(
                candidateResume.contact?.workAuthorization || ""
              ),
              workPreference: stripLongDashes(
                candidateResume.contact?.workPreference || ""
              ),
              links: Array.isArray(candidateResume.contact?.links)
                ? candidateResume.contact.links.map((s: string) =>
                    stripLongDashes(String(s))
                  )
                : [],
            },
            targetJobTitles: Array.isArray(candidateResume.targetJobTitles)
              ? candidateResume.targetJobTitles.map((s: string) =>
                  stripLongDashes(String(s))
                )
              : [],
            summary: stripLongDashes(candidateResume.summary || ""),
            skills: Array.isArray(candidateResume.skills)
              ? candidateResume.skills.map((s: string) =>
                  stripLongDashes(String(s))
                )
              : [],
            atsKeywords: Array.isArray(candidateResume.atsKeywords)
              ? candidateResume.atsKeywords.map((s: string) =>
                  stripLongDashes(String(s))
                )
              : [],
            aiUsage: Array.isArray(candidateResume.aiUsage)
              ? candidateResume.aiUsage.map((s: string) =>
                  stripLongDashes(String(s))
                )
              : [],
            experience: Array.isArray(candidateResume.experience)
              ? candidateResume.experience.map(
                  (
                    e: {
                      id?: string;
                      company?: string;
                      role?: string;
                      location?: string;
                      startDate?: string;
                      endDate?: string;
                      bullets?: string[];
                    },
                    idx: number
                  ) => ({
                    id: e.id || `exp_${Date.now()}_${idx}`,
                    company: stripLongDashes(e.company || ""),
                    role: stripLongDashes(e.role || ""),
                    location: stripLongDashes(e.location || ""),
                    startDate: stripLongDashes(e.startDate || ""),
                    endDate: stripLongDashes(e.endDate || ""),
                    bullets: Array.isArray(e.bullets)
                      ? e.bullets.map((b: string) => stripLongDashes(String(b)))
                      : [],
                  })
                )
              : [],
            projects: Array.isArray(candidateResume.projects)
              ? candidateResume.projects.map(
                  (
                    p: {
                      id?: string;
                      name?: string;
                      url?: string;
                      techStack?: string;
                      description?: string;
                    },
                    idx: number
                  ) => ({
                    id: p.id || `proj_${Date.now()}_${idx}`,
                    name: stripLongDashes(p.name || ""),
                    url: stripLongDashes(p.url || ""),
                    techStack: stripLongDashes(p.techStack || ""),
                    description: stripLongDashes(p.description || ""),
                  })
                )
              : [],
            education: Array.isArray(candidateResume.education)
              ? candidateResume.education.map(
                  (
                    ed: {
                      id?: string;
                      institution?: string;
                      degree?: string;
                      year?: string;
                    },
                    idx: number
                  ) => ({
                    id: ed.id || `edu_${Date.now()}_${idx}`,
                    institution: stripLongDashes(ed.institution || ""),
                    degree: stripLongDashes(ed.degree || ""),
                    year: stripLongDashes(ed.year || ""),
                  })
                )
              : [],
            certifications: Array.isArray(candidateResume.certifications)
              ? candidateResume.certifications.map((c: string) =>
                  stripLongDashes(String(c))
                )
              : [],
            accomplishments: Array.isArray(candidateResume.accomplishments)
              ? candidateResume.accomplishments.map((a: string) =>
                  stripLongDashes(String(a))
                )
              : [],
            defaultCoverLetter: stripLongDashes(
              candidateResume.defaultCoverLetter || ""
            ),
          },
          method: "json-direct",
          extractedText: "",
        });
        return;
      }

      // Extract raw text from binary PDF, DOCX, HTML, or plain text
      let extractedText = rawText ? stripLongDashes(String(rawText)) : "";
      const isPdf = lowerName.endsWith(".pdf") || lowerMime === "application/pdf";
      const isDocx =
        lowerName.endsWith(".docx") ||
        lowerMime.includes("officedocument.wordprocessingml.document");
      const isHtml =
        lowerName.endsWith(".html") ||
        lowerName.endsWith(".htm") ||
        lowerMime.includes("html");

      if (!extractedText && buffer) {
        if (isDocx) {
          const docxOut = await mammoth.extractRawText({ buffer });
          extractedText = stripLongDashes(docxOut.value || "");
        } else if (isPdf) {
          try {
            const pdfOut = await extractText(new Uint8Array(buffer), {
              mergePages: true,
            });
            extractedText = stripLongDashes(pdfOut.text || "");
          } catch {
            extractedText = "";
          }
        } else if (isHtml) {
          extractedText = stripHtmlTags(buffer.toString("utf-8"));
        } else {
          extractedText = stripLongDashes(buffer.toString("utf-8"));
        }
      }

      const ai = getGeminiClient();
      if (!ai) {
        if (!extractedText.trim()) {
          res.status(422).json({
            error:
              "Could not extract readable text from this file locally. Try a searchable PDF, .docx, or paste your resume text.",
          });
          return;
        }
        res.json({
          masterResume: null,
          extractedText,
          method: "extracted-text-only",
        });
        return;
      }

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (isPdf && base64Data) {
        parts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: base64Data,
          },
        });
      }

      parts.push({
        text: [
          "Extract the candidate's resume into the structured MasterResume JSON schema.",
          "STRICT GROUND-TRUTH RULES:",
          "- Extract ONLY verbatim facts present in the resume. NEVER invent skills, metrics, dates, companies, degrees, projects, AI usage, certifications, or accomplishments.",
          "- Normalize work history startDate and endDate to YYYY-MM when both month and year are stated (e.g., 'Feb 2023' -> '2023-02'), 'Present' for current roles, or 'YYYY' if only a year is given.",
          "- Populate linkedinUrl, githubUrl, portfolioUrl, and substackUrl specifically when present; place any extra social/profile URLs in contact.links.",
          "- Populate workAuthorization, securityClearance (if any active/inactive clearance such as Public Trust, Secret, Top Secret, TS/SCI, DOE Q is stated), and workPreference if stated in the resume; otherwise leave empty string.",
          "- Extract personal/open-source projects into projects (with name, url, techStack, description). Extract practical AI/LLM/automation workflows if explicitly mentioned into aiUsage.",
          "- Never output em dashes or en dashes; use standard hyphens (-).",
          extractedText
            ? `\nEXTRACTED RESUME TEXT:\n${extractedText.slice(0, 30000)}`
            : "",
        ].join("\n"),
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              contact: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  email: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  location: { type: Type.STRING },
                  linkedinUrl: { type: Type.STRING },
                  githubUrl: { type: Type.STRING },
                  portfolioUrl: { type: Type.STRING },
                  substackUrl: { type: Type.STRING },
                  workAuthorization: { type: Type.STRING },
                  securityClearance: { type: Type.STRING },
                  workPreference: { type: Type.STRING },
                  links: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  "name",
                  "email",
                  "phone",
                  "location",
                  "linkedinUrl",
                  "githubUrl",
                  "portfolioUrl",
                  "substackUrl",
                  "workAuthorization",
                  "securityClearance",
                  "workPreference",
                  "links",
                ],
              },
              targetJobTitles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              summary: { type: Type.STRING },
              skills: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              atsKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              aiUsage: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              experience: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    company: { type: Type.STRING },
                    role: { type: Type.STRING },
                    location: { type: Type.STRING },
                    startDate: { type: Type.STRING },
                    endDate: { type: Type.STRING },
                    bullets: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    "company",
                    "role",
                    "location",
                    "startDate",
                    "endDate",
                    "bullets",
                  ],
                },
              },
              projects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    url: { type: Type.STRING },
                    techStack: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["name", "url", "techStack", "description"],
                },
              },
              education: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    institution: { type: Type.STRING },
                    degree: { type: Type.STRING },
                    year: { type: Type.STRING },
                  },
                  required: ["institution", "degree", "year"],
                },
              },
              certifications: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              accomplishments: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              "contact",
              "targetJobTitles",
              "summary",
              "skills",
              "atsKeywords",
              "aiUsage",
              "experience",
              "projects",
              "education",
              "certifications",
              "accomplishments",
            ],
          },
        },
      });

      const structured = JSON.parse(stripLongDashes(response.text || "{}"));
      res.json({
        masterResume: {
          contact: {
            name: stripLongDashes(structured.contact?.name || ""),
            email: stripLongDashes(structured.contact?.email || ""),
            phone: stripLongDashes(structured.contact?.phone || ""),
            location: stripLongDashes(structured.contact?.location || ""),
            linkedinUrl: stripLongDashes(structured.contact?.linkedinUrl || ""),
            githubUrl: stripLongDashes(structured.contact?.githubUrl || ""),
            portfolioUrl: stripLongDashes(
              structured.contact?.portfolioUrl || ""
            ),
            substackUrl: stripLongDashes(structured.contact?.substackUrl || ""),
            workAuthorization: stripLongDashes(
              structured.contact?.workAuthorization || ""
            ),
            securityClearance: stripLongDashes(
              structured.contact?.securityClearance || ""
            ),
            workPreference: stripLongDashes(
              structured.contact?.workPreference || ""
            ),
            links: Array.isArray(structured.contact?.links)
              ? structured.contact.links
                  .map((s: string) => stripLongDashes(String(s).trim()))
                  .filter(Boolean)
              : [],
          },
          targetJobTitles: Array.isArray(structured.targetJobTitles)
            ? structured.targetJobTitles
                .map((s: string) => stripLongDashes(String(s).trim()))
                .filter(Boolean)
            : [],
          summary: stripLongDashes(structured.summary || ""),
          skills: Array.isArray(structured.skills)
            ? structured.skills
                .map((s: string) => stripLongDashes(String(s).trim()))
                .filter(Boolean)
            : [],
          atsKeywords: Array.isArray(structured.atsKeywords)
            ? structured.atsKeywords
                .map((s: string) => stripLongDashes(String(s).trim()))
                .filter(Boolean)
            : [],
          aiUsage: Array.isArray(structured.aiUsage)
            ? structured.aiUsage
                .map((s: string) => stripLongDashes(String(s).trim()))
                .filter(Boolean)
            : [],
          experience: Array.isArray(structured.experience)
            ? structured.experience.map(
                (
                  e: {
                    company?: string;
                    role?: string;
                    location?: string;
                    startDate?: string;
                    endDate?: string;
                    bullets?: string[];
                  },
                  idx: number
                ) => ({
                  id: `exp_${Date.now()}_${idx}`,
                  company: stripLongDashes(e.company || ""),
                  role: stripLongDashes(e.role || ""),
                  location: stripLongDashes(e.location || ""),
                  startDate: stripLongDashes(e.startDate || ""),
                  endDate: stripLongDashes(e.endDate || ""),
                  bullets: Array.isArray(e.bullets)
                    ? e.bullets
                        .map((b: string) => stripLongDashes(String(b).trim()))
                        .filter(Boolean)
                    : [],
                })
              )
            : [],
          projects: Array.isArray(structured.projects)
            ? structured.projects.map(
                (
                  p: {
                    id?: string;
                    name?: string;
                    url?: string;
                    techStack?: string;
                    description?: string;
                  },
                  idx: number
                ) => ({
                  id: p.id || `proj_${Date.now()}_${idx}`,
                  name: stripLongDashes(p.name || ""),
                  url: stripLongDashes(p.url || ""),
                  techStack: stripLongDashes(p.techStack || ""),
                  description: stripLongDashes(p.description || ""),
                })
              )
            : [],
          education: Array.isArray(structured.education)
            ? structured.education.map(
                (
                  ed: {
                    institution?: string;
                    degree?: string;
                    year?: string;
                  },
                  idx: number
                ) => ({
                  id: `edu_${Date.now()}_${idx}`,
                  institution: stripLongDashes(ed.institution || ""),
                  degree: stripLongDashes(ed.degree || ""),
                  year: stripLongDashes(ed.year || ""),
                })
              )
            : [],
          certifications: Array.isArray(structured.certifications)
            ? structured.certifications
                .map((c: string) => stripLongDashes(String(c).trim()))
                .filter(Boolean)
            : [],
          accomplishments: Array.isArray(structured.accomplishments)
            ? structured.accomplishments
                .map((a: string) => stripLongDashes(String(a).trim()))
                .filter(Boolean)
            : [],
          defaultCoverLetter: "",
        },
        extractedText,
        method: "gemini-ai",
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to parse uploaded Master Resume.";
      res.status(500).json({ error: stripLongDashes(msg) });
    }
  });

  // 7. Convert Freeflow Unstructured Job Brainstorm into NDA/Clearance-Safe Usable Resume Entries
  app.post("/api/resume/convert-brainstorm", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "Gemini API key not configured. Converted brainstorm locally using deterministic parser.",
      });
      return;
    }

    const {
      rawText = "",
      company = "",
      role = "",
      location = "",
      startDate = "",
      endDate = "",
      isConfidentialNda = false,
      isClearanceRestricted = false,
      securityClearance = "",
      redactionTerms = "",
    } = req.body || {};

    if (!String(rawText).trim()) {
      res
        .status(400)
        .json({ error: "Enter freeflow job brainstorm notes first." });
      return;
    }

    try {
      // Pre-redact any explicit confidential/classified identifiers before model processing
      let safeBrainstormText = stripLongDashes(String(rawText));
      const explicitRedactions = String(redactionTerms || "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      const genericLabel = isClearanceRestricted
        ? "[Unclassified Government Program]"
        : "[Confidential Client Program]";

      explicitRedactions.forEach((term) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        safeBrainstormText = safeBrainstormText.replace(
          new RegExp(escaped, "gi"),
          genericLabel
        );
      });

      const systemInstruction = [
        "You convert messy, non-listed, freeflow job brainstorm dumps written by an applicant into crisp, ATS-compatible and Hiring-Manager-ready resume entries.",
        "STRICT HONESTY & COMPLIANCE RULES:",
        "1. NEVER invent numbers, benchmarks, skills, promotions, titles, companies, or dates. Convert ONLY facts, duties, tools, benchmarks, and promotions present in the user's raw brainstorm.",
        "2. Prioritize quantified benchmarks (latency, %, $, volume, hours saved, team size, SLA) and promotions in Bullet #1 and Bullet #2 so hiring managers see concrete proof immediately.",
        "3. Rewrite casual first-person stream-of-consciousness notes into strong, direct action-verb resume bullets (Action Verb + Technical/Operational Scope + Measurable Result).",
        "4. CONFIDENTIALITY (NDA) & SECURITY CLEARANCE PROTECTION:",
        "   - If isConfidentialNda is true, generalize any proprietary client names, internal codenames, unreleased product names, or sensitive financial figures into NDA-safe industry descriptions (e.g. 'a Fortune 500 enterprise client', 'internal high-volume platform') so zero NDA terms are violated.",
        "   - If isClearanceRestricted is true or securityClearance is provided, ensure every bullet is strictly UNCLASSIFIED and pre-publication safe: describe transferable technical, analytical, and operational execution without sensitive mission locations, classified intelligence sources, or restricted program codenames.",
        "5. Normalize startDate and endDate to YYYY-MM (or 'Present') when mentioned; keep provided company/role/dates if supplied.",
        "6. Extract only interview-defensible skills explicitly mentioned in the brainstorm into extractedSkills.",
        "7. NEVER use em dashes or en dashes anywhere. Use standard hyphens (-), commas, or colons.",
        `8. NEVER use AI writing tropes or cliches (${BANNED_PHRASES.join(", ")}).`,
      ].join("\n");

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: JSON.stringify({
          providedCompany: stripLongDashes(String(company || "")),
          providedRole: stripLongDashes(String(role || "")),
          providedLocation: stripLongDashes(String(location || "")),
          providedStartDate: stripLongDashes(String(startDate || "")),
          providedEndDate: stripLongDashes(String(endDate || "")),
          isConfidentialNda: Boolean(isConfidentialNda),
          isClearanceRestricted: Boolean(isClearanceRestricted),
          securityClearance: stripLongDashes(String(securityClearance || "")),
          rawFreeflowBrainstorm: safeBrainstormText,
        }),
        config: {
          systemInstruction,
          temperature: 0.15,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              company: { type: Type.STRING },
              role: { type: Type.STRING },
              location: { type: Type.STRING },
              startDate: { type: Type.STRING },
              endDate: { type: Type.STRING },
              bullets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "3 to 7 crisp, impact-first resume bullets grounded strictly in the brainstorm and sanitized for NDA/Clearance compliance.",
              },
              promotionSummary: {
                type: Type.STRING,
                description:
                  "Short summary if a promotion or scope expansion was mentioned in the brainstorm; empty string otherwise.",
              },
              extractedSkills: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              extractedKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              extractedAccomplishments: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              confidentialityNote: {
                type: Type.STRING,
                description:
                  "Short public-safe tag if NDA or Security Clearance applies (e.g. 'Scope Generalized per NDA' or 'Unclassified Scope Summary'); empty string otherwise.",
              },
              complianceNotes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "1 to 3 short confirmations of how NDA/Clearance boundaries and factual accuracy were preserved.",
              },
            },
            required: [
              "company",
              "role",
              "location",
              "startDate",
              "endDate",
              "bullets",
              "promotionSummary",
              "extractedSkills",
              "extractedKeywords",
              "extractedAccomplishments",
              "confidentialityNote",
              "complianceNotes",
            ],
          },
        },
      });

      const parsed = JSON.parse(stripLongDashes(response.text || "{}"));
      res.json({
        company: stripLongDashes(parsed.company || company || ""),
        role: stripLongDashes(parsed.role || role || ""),
        location: stripLongDashes(parsed.location || location || ""),
        startDate: stripLongDashes(parsed.startDate || startDate || "2023-01"),
        endDate: stripLongDashes(parsed.endDate || endDate || "Present"),
        bullets: Array.isArray(parsed.bullets)
          ? parsed.bullets
              .map((b: string) => stripLongDashes(String(b).trim()))
              .filter(Boolean)
          : [],
        promotionSummary: stripLongDashes(parsed.promotionSummary || ""),
        extractedSkills: Array.isArray(parsed.extractedSkills)
          ? parsed.extractedSkills
              .map((s: string) => stripLongDashes(String(s).trim()))
              .filter(Boolean)
          : [],
        extractedKeywords: Array.isArray(parsed.extractedKeywords)
          ? parsed.extractedKeywords
              .map((s: string) => stripLongDashes(String(s).trim()))
              .filter(Boolean)
          : [],
        extractedAccomplishments: Array.isArray(parsed.extractedAccomplishments)
          ? parsed.extractedAccomplishments
              .map((s: string) => stripLongDashes(String(s).trim()))
              .filter(Boolean)
          : [],
        confidentialityNote: stripLongDashes(parsed.confidentialityNote || ""),
        complianceNotes: Array.isArray(parsed.complianceNotes)
          ? parsed.complianceNotes
              .map((s: string) => stripLongDashes(String(s).trim()))
              .filter(Boolean)
          : [],
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to convert freeflow brainstorm.";
      res.status(500).json({ error: stripLongDashes(msg) });
    }
  });

  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
