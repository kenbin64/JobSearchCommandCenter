import React, { useMemo, useState } from "react";
import {
  ApplicationRecord,
  ApplicationStage,
  AtsProvider,
  ClosedReason,
  DiscoveredJob,
  MasterResume,
  SavedBoardConnection,
  TimelineEvent,
  TimelineEventType,
} from "../types";
import {
  extractRequirementsFromJd,
  findPriorJobMatches,
  sanitizeDashes,
  todayIsoDate,
} from "../engine";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Globe,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

interface JobBoardsViewProps {
  masterResume: MasterResume;
  applications: ApplicationRecord[];
  savedBoards: SavedBoardConnection[];
  onUpdateSavedBoards: (boards: SavedBoardConnection[]) => void;
  onImportJobToPipeline: (
    app: ApplicationRecord,
    evt: TimelineEvent,
    openInTailor: boolean
  ) => void;
}

type SearchMode = "boards" | "ats" | "web" | "url";

export const JobBoardsView: React.FC<JobBoardsViewProps> = ({
  masterResume,
  applications,
  savedBoards,
  onUpdateSavedBoards,
  onImportJobToPipeline,
}) => {
  const defaultQuery = useMemo(() => {
    if (masterResume.experience[0]?.role) {
      return masterResume.experience[0].role;
    }
    if (masterResume.skills.length > 0) {
      return masterResume.skills.slice(0, 2).join(" ");
    }
    return "Software Engineer";
  }, [masterResume]);

  const [mode, setMode] = useState<SearchMode>("boards");
  const [query, setQuery] = useState<string>(defaultQuery);
  const [locationFilter, setLocationFilter] = useState<string>("");

  // Public boards toggles
  const [useRemotive, setUseRemotive] = useState(true);
  const [useArbeitnow, setUseArbeitnow] = useState(true);
  const [useTheMuse, setUseTheMuse] = useState(true);

  // Direct ATS Board connector state
  const [atsProvider, setAtsProvider] = useState<AtsProvider>("greenhouse");
  const [atsSlug, setAtsSlug] = useState<string>("stripe");
  const [newBoardLabel, setNewBoardLabel] = useState<string>("");
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editBoardLabel, setEditBoardLabel] = useState<string>("");
  const [editBoardSlug, setEditBoardSlug] = useState<string>("");
  const [editBoardProvider, setEditBoardProvider] =
    useState<AtsProvider>("greenhouse");

  // Gemini Web Search state
  const [webBoardFocus, setWebBoardFocus] = useState<string>("");
  const [webSummary, setWebSummary] = useState<string>("");
  const [webSources, setWebSources] = useState<
    Array<{ uri: string; title: string }>
  >([]);

  // URL Direct Import state
  const [importUrlInput, setImportUrlInput] = useState<string>("");
  const [importedPreview, setImportedPreview] = useState<{
    company: string;
    role: string;
    location: string;
    source: string;
    jobUrl: string;
    jobDescription: string;
  } | null>(null);

  // Results & Loading state
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [hidePreviouslyRejected, setHidePreviouslyRejected] =
    useState<boolean>(false);

  const computeQuickSkillOverlap = (jd: string): {
    score: number;
    matched: string[];
  } => {
    const reqs = extractRequirementsFromJd(jd);
    if (reqs.length === 0) return { score: 0, matched: [] };
    const masterCorpus = [
      masterResume.summary,
      ...masterResume.skills,
      ...masterResume.experience.flatMap((e) => e.bullets),
    ]
      .join(" ")
      .toLowerCase();

    const matched = reqs.filter((r) => masterCorpus.includes(r.toLowerCase()));
    const score = Math.min(100, Math.round((matched.length / reqs.length) * 100));
    return { score, matched };
  };

  const urlInputMatches = useMemo(() => {
    if (importUrlInput.trim().length < 8) return [];
    return findPriorJobMatches({ jobUrl: importUrlInput }, applications);
  }, [importUrlInput, applications]);

  const previewMatches = useMemo(() => {
    if (!importedPreview) return [];
    return findPriorJobMatches(
      {
        company: importedPreview.company,
        role: importedPreview.role,
        jobUrl: importedPreview.jobUrl,
        jobDescription: importedPreview.jobDescription,
      },
      applications
    );
  }, [importedPreview, applications]);

  const handleSearchPublicBoards = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const sources: string[] = [];
    if (useRemotive) sources.push("remotive");
    if (useArbeitnow) sources.push("arbeitnow");
    if (useTheMuse) sources.push("themuse");

    if (sources.length === 0) {
      setStatusMessage("Enable at least one public job board source.");
      return;
    }

    setLoading(true);
    setStatusMessage("Querying live public job boards...");
    try {
      const resp = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          location: locationFilter.trim(),
          sources,
        }),
      });
      const data = await resp.json();
      const fetched: DiscoveredJob[] = Array.isArray(data.jobs) ? data.jobs : [];
      setJobs(fetched);
      const warnText =
        Array.isArray(data.warnings) && data.warnings.length > 0
          ? ` (${data.warnings.join("; ")})`
          : "";
      setStatusMessage(
        `Found ${fetched.length} live postings across selected boards${warnText}.`
      );
    } catch {
      setStatusMessage("Network error while querying public job boards.");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAtsBoard = async (
    providerOverride?: AtsProvider,
    slugOverride?: string
  ) => {
    const targetProvider = providerOverride || atsProvider;
    const targetSlug = (slugOverride ?? atsSlug).trim().toLowerCase();
    if (!targetSlug) {
      setStatusMessage("Enter a company board slug (for example: stripe, cloudflare, linear).");
      return;
    }

    setLoading(true);
    setStatusMessage(
      `Fetching live openings from ${targetProvider} (${targetSlug})...`
    );
    try {
      const resp = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          location: locationFilter.trim(),
          atsProvider: targetProvider,
          atsSlug: targetSlug,
        }),
      });
      const data = await resp.json();
      const fetched: DiscoveredJob[] = Array.isArray(data.jobs) ? data.jobs : [];
      setJobs(fetched);
      if (data.warnings?.length) {
        setStatusMessage(data.warnings.join(" · "));
      } else {
        setStatusMessage(
          `Loaded ${fetched.length} roles from ${targetProvider} board '${targetSlug}'.`
        );
      }
    } catch {
      setStatusMessage("Could not connect to ATS board endpoint.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBoardBookmark = () => {
    const cleanSlug = atsSlug.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    if (!cleanSlug) return;
    const exists = savedBoards.some(
      (b) => b.provider === atsProvider && b.slug === cleanSlug
    );
    if (exists) {
      setStatusMessage("That company board is already pinned.");
      return;
    }
    const label =
      sanitizeDashes(newBoardLabel.trim()) ||
      cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);
    onUpdateSavedBoards([
      ...savedBoards,
      {
        id: `bd_${Date.now()}`,
        provider: atsProvider,
        slug: cleanSlug,
        label,
      },
    ]);
    setNewBoardLabel("");
  };

  const handleRemoveBoardBookmark = (id: string) => {
    onUpdateSavedBoards(savedBoards.filter((b) => b.id !== id));
    if (editingBoardId === id) setEditingBoardId(null);
  };

  const startEditBoardBookmark = (bd: SavedBoardConnection) => {
    setEditingBoardId(bd.id);
    setEditBoardLabel(bd.label);
    setEditBoardSlug(bd.slug);
    setEditBoardProvider(bd.provider);
  };

  const saveEditedBoardBookmark = (id: string) => {
    const cleanSlug = editBoardSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "");
    if (!cleanSlug) return;
    const cleanLabel =
      sanitizeDashes(editBoardLabel.trim()) ||
      cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);
    onUpdateSavedBoards(
      savedBoards.map((b) =>
        b.id === id
          ? {
              ...b,
              label: cleanLabel,
              slug: cleanSlug,
              provider: editBoardProvider,
            }
          : b
      )
    );
    setEditingBoardId(null);
  };

  const handleRunWebSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setWebSummary("");
    setWebSources([]);
    setStatusMessage(
      "Privacy Notice: Sending search terms to Gemini Google Search grounding..."
    );
    try {
      const resp = await fetch("/api/jobs/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          location: locationFilter.trim(),
          boardFilter: webBoardFocus.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatusMessage(data.error || "Web search unavailable.");
      } else {
        setWebSummary(data.summary || "");
        setWebSources(Array.isArray(data.sources) ? data.sources : []);
        setStatusMessage(
          `Grounded web search complete (${(data.sources || []).length} source links verified).`
        );
      }
    } catch {
      setStatusMessage("Failed to run web-grounded job search.");
    } finally {
      setLoading(false);
    }
  };

  const handleImportByUrl = async (
    urlToImport?: string,
    instantTailor = false
  ) => {
    const target = (urlToImport ?? importUrlInput).trim();
    if (!target) return;
    setImportUrlInput(target);
    setMode("url");
    setLoading(true);
    setImportedPreview(null);
    setStatusMessage("Fetching and parsing job posting URL...");
    try {
      const resp = await fetch("/api/jobs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatusMessage(data.error || "Could not parse URL automatically.");
      } else {
        const parsedJob = {
          company: sanitizeDashes(data.company || "Unknown Company"),
          role: sanitizeDashes(data.role || "Open Role"),
          location: sanitizeDashes(data.location || ""),
          source: sanitizeDashes(data.source || "Job URL"),
          jobUrl: data.jobUrl || target,
          jobDescription: sanitizeDashes(data.jobDescription || ""),
        };
        const priorMatches = findPriorJobMatches(
          {
            company: parsedJob.company,
            role: parsedJob.role,
            jobUrl: parsedJob.jobUrl,
            jobDescription: parsedJob.jobDescription,
          },
          applications
        );
        const hasPriorRejection = priorMatches.some((m) => m.isRejected);
        if (
          instantTailor &&
          parsedJob.jobDescription.trim().length > 0 &&
          !hasPriorRejection
        ) {
          saveDiscoveredJob(
            {
              company: parsedJob.company,
              role: parsedJob.role,
              location: parsedJob.location,
              boardSource: parsedJob.source,
              jobUrl: parsedJob.jobUrl,
              jobDescription: parsedJob.jobDescription,
            },
            true
          );
          return;
        }
        setImportedPreview(parsedJob);
        setStatusMessage(
          hasPriorRejection
            ? "Flagged: This posting matches a role where you were previously rejected. Review details below before saving."
            : "Extracted job details. Review below and save to Pipeline."
        );
      }
    } catch {
      setStatusMessage("Network error while importing job URL.");
    } finally {
      setLoading(false);
    }
  };

  const saveDiscoveredJob = (
    job: {
      externalId?: string;
      company: string;
      role: string;
      location: string;
      boardSource: string;
      jobUrl: string;
      jobDescription: string;
    },
    openInTailor: boolean
  ) => {
    const id = `app_${Date.now()}`;
    const record: ApplicationRecord = {
      id,
      company: sanitizeDashes(job.company),
      role: sanitizeDashes(job.role),
      contactName: "",
      contactEmail: "",
      source: sanitizeDashes(job.boardSource),
      jobUrl: job.jobUrl,
      stage: ApplicationStage.Saved,
      stageReason: ClosedReason.None,
      jobDescription: sanitizeDashes(job.jobDescription),
      notes: job.location ? `Location: ${sanitizeDashes(job.location)}` : "",
      createdAt: todayIsoDate(),
      updatedAt: new Date().toISOString(),
    };
    const evt: TimelineEvent = {
      id: `evt_${Date.now()}`,
      applicationId: id,
      date: todayIsoDate(),
      type: TimelineEventType.Note,
      notes: `Imported from ${sanitizeDashes(job.boardSource)}`,
      sequence: Date.now(),
    };

    if (job.externalId) {
      setAddedIds((prev) => ({ ...prev, [job.externalId!]: true }));
    }
    onImportJobToPipeline(record, evt, openInTailor);
  };

  // External job board deep-link builders for boards requiring user sessions (Handshake, LinkedIn, Indeed, Wellfound, Otta)
  const externalBoardLinks = useMemo(() => {
    const qEnc = encodeURIComponent(query.trim() || "Software Engineer");
    const locEnc = encodeURIComponent(locationFilter.trim());
    return [
      {
        name: "Handshake",
        url: `https://app.joinhandshake.com/stu/postings?query=${qEnc}`,
      },
      {
        name: "LinkedIn Jobs",
        url: `https://www.linkedin.com/jobs/search/?keywords=${qEnc}${
          locEnc ? `&location=${locEnc}` : ""
        }`,
      },
      {
        name: "Indeed",
        url: `https://www.indeed.com/jobs?q=${qEnc}${
          locEnc ? `&l=${locEnc}` : ""
        }`,
      },
      {
        name: "Utah Jobs",
        url: `https://jobs.utah.gov/jsp/utahjobs/seeker/search/results.jsp?keywords=${qEnc}`,
      },
      {
        name: "Wellfound",
        url: `https://wellfound.com/jobs?q=${qEnc}`,
      },
      {
        name: "Y Combinator Jobs",
        url: `https://www.workatastartup.com/jobs?query=${qEnc}`,
      },
    ];
  }, [query, locationFilter]);

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>
              Privacy Notice: Master Resume data stays strictly in your browser and is never transmitted during job board searches or URL imports
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Job Boards & Discovery
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Search live public job feeds, connect directly to Greenhouse, Lever, and Ashby company boards, run web-grounded job discovery, or import any posting by URL.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("boards")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === "boards"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Public Job Feeds
          </button>
          <button
            type="button"
            onClick={() => setMode("ats")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === "ats"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ATS Company Boards
          </button>
          <button
            type="button"
            onClick={() => setMode("web")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === "web"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Web Board Search (AI)
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === "url"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Import by URL
          </button>
        </div>
      </div>

      {/* Quick-Launch Deep Links Bar for External Boards */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs">
        <span className="text-slate-600">
          <strong className="text-slate-900">External Portals:</strong> Open search in new tab, then paste URL into <strong>Import by URL</strong>:
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {externalBoardLinks.map((b) => (
            <a
              key={b.name}
              href={b.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
            >
              {b.name} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>

      {/* Mode 1: Multi-Board Aggregator (Remotive, Arbeitnow, The Muse) */}
      {mode === "boards" && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <form onSubmit={handleSearchPublicBoards} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-6">
                <label className="block text-xs font-medium text-slate-700">
                  Role, Skill, or Keyword
                </label>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Backend Engineer, Python, Data Platform..."
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-slate-700">
                  Location Filter (optional)
                </label>
                <input
                  type="text"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  placeholder="Remote, Austin, New York..."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-end md:col-span-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "Searching..." : "Search Boards"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-slate-700">
                <span className="font-medium text-slate-500">Connected Feeds:</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useRemotive}
                    onChange={(e) => setUseRemotive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Remotive
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useArbeitnow}
                    onChange={(e) => setUseArbeitnow(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Arbeitnow
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useTheMuse}
                    onChange={(e) => setUseTheMuse(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  The Muse
                </label>
              </div>
              {masterResume.skills.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery(masterResume.skills.slice(0, 2).join(" "))}
                  className="text-blue-600 hover:underline cursor-pointer"
                >
                  Use top Master Resume skills ({masterResume.skills.slice(0, 2).join(", ")})
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {/* Mode 2: Direct ATS Company Board Connector (Greenhouse, Lever, Ashby) */}
      {mode === "ats" && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Connect Directly to Company ATS Boards
            </h2>
            <p className="text-xs text-slate-500">
              Pull live, unedited job descriptions straight from any company using Greenhouse, Lever, or Ashby public APIs. Pin target employers for one-click checks.
            </p>
          </div>

          {/* Pinned Company Boards */}
          {savedBoards.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Pinned Boards:
                </span>
                {savedBoards.map((bd) => (
                  <div
                    key={bd.id}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAtsProvider(bd.provider);
                        setAtsSlug(bd.slug);
                        handleFetchAtsBoard(bd.provider, bd.slug);
                      }}
                      className="px-2.5 py-1 font-medium text-slate-800 hover:text-blue-600 cursor-pointer"
                    >
                      {bd.label}{" "}
                      <span className="text-slate-400">({bd.provider})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditBoardBookmark(bd)}
                      className="border-l border-slate-200 px-1.5 py-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                      aria-label={`Edit ${bd.label}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveBoardBookmark(bd.id)}
                      className="border-l border-slate-200 px-1.5 py-1 text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label={`Unpin ${bd.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              {editingBoardId && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                  <select
                    value={editBoardProvider}
                    onChange={(e) =>
                      setEditBoardProvider(e.target.value as AtsProvider)
                    }
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                  >
                    <option value="greenhouse">Greenhouse</option>
                    <option value="lever">Lever</option>
                    <option value="ashby">Ashby</option>
                  </select>
                  <input
                    type="text"
                    value={editBoardSlug}
                    onChange={(e) => setEditBoardSlug(e.target.value)}
                    placeholder="Board slug"
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                  />
                  <input
                    type="text"
                    value={editBoardLabel}
                    onChange={(e) => setEditBoardLabel(e.target.value)}
                    placeholder="Display name"
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => saveEditedBoardBookmark(editingBoardId)}
                    className="rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBoardId(null)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700">
                ATS Platform
              </label>
              <select
                value={atsProvider}
                onChange={(e) => setAtsProvider(e.target.value as AtsProvider)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="ashby">Ashby</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700">
                Company Board Slug
              </label>
              <input
                type="text"
                value={atsSlug}
                onChange={(e) => setAtsSlug(e.target.value)}
                placeholder="stripe, cloudflare, linear..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700">
                Keyword Filter (optional)
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Engineer, Designer, Intern..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-end gap-2 md:col-span-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleFetchAtsBoard()}
                className="w-full rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
              >
                {loading ? "Loading..." : "Load Board"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <input
              type="text"
              value={newBoardLabel}
              onChange={(e) => setNewBoardLabel(e.target.value)}
              placeholder="Display label (optional)"
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
            />
            <button
              type="button"
              onClick={handleSaveBoardBookmark}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Pin Current ATS Board
            </button>
          </div>
        </section>
      )}

      {/* Mode 3: Gemini Google-Search-Grounded Web Discovery */}
      {mode === "web" && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <div className="text-xs text-slate-500">
              Privacy Notice: Sends your search query (never your resume) to Gemini with live Google Search grounding
            </div>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">
              AI Web Job Search Across Major Boards
            </h2>
          </div>

          <form onSubmit={handleRunWebSearch} className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-5">
              <label className="block text-xs font-medium text-slate-700">
                Search Query
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Backend Software Engineer Python"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700">
                Location
              </label>
              <input
                type="text"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Austin, TX or Remote"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700">
                Board Filter
              </label>
              <select
                value={webBoardFocus}
                onChange={(e) => setWebBoardFocus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
              >
                <option value="">All Boards</option>
                <option value="Greenhouse and Lever">Greenhouse / Lever</option>
                <option value="Handshake">Handshake</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Wellfound">Wellfound</option>
                <option value="Indeed">Indeed</option>
              </select>
            </div>

            <div className="flex items-end md:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
              >
                <Globe className="h-3.5 w-3.5" />
                {loading ? "Searching..." : "Search Web"}
              </button>
            </div>
          </form>

          {(webSummary || webSources.length > 0) && (
            <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
              {webSummary && (
                <div className="rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {webSummary}
                </div>
              )}

              {webSources.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-900">
                    Verified Grounding Links (Click "Import URL" to pull into Pipeline)
                  </h3>
                  <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {webSources.map((src, i) => {
                      const srcMatches = findPriorJobMatches(
                        { jobUrl: src.uri },
                        applications
                      );
                      const srcRejected = srcMatches.find((m) => m.isRejected);
                      return (
                        <div
                          key={i}
                          className="flex flex-col justify-between gap-2 px-4 py-2.5 text-xs sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0">
                            <a
                              href={src.uri}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline truncate"
                            >
                              <span className="truncate">{src.title}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                            {srcRejected && (
                              <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-red-700">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span>
                                  Previously Rejected ({srcRejected.app.role} at{" "}
                                  {srcRejected.app.company}
                                  {srcRejected.app.rejectedAt
                                    ? ` · ${srcRejected.app.rejectedAt}`
                                    : ""}
                                  )
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleImportByUrl(src.uri)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Import URL
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Mode 4: One-Click Job Posting URL Importer */}
      {mode === "url" && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Import Job Posting by URL
            </h2>
            <p className="text-xs text-slate-500">
              Paste a direct link from Greenhouse, Lever, Ashby, or a company career page to extract the title, company, and full requirements automatically.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={importUrlInput}
                onChange={(e) => setImportUrlInput(e.target.value)}
                placeholder="https://boards.greenhouse.io/cloudflare/jobs/..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImportByUrl(undefined, false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              {loading ? "Extracting..." : "Preview Posting"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleImportByUrl(undefined, true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              {loading ? "Importing..." : "Import & Tailor Immediately"}
            </button>
          </div>

          {/* Live URL Repeat / Previously Rejected Check */}
          {(previewMatches.length > 0 || urlInputMatches.length > 0) && (() => {
            const activeMatches =
              previewMatches.length > 0 ? previewMatches : urlInputMatches;
            const top = activeMatches[0];
            return (
              <div
                className={`rounded-lg border p-3.5 text-xs ${
                  top.isRejected
                    ? "border-red-200 bg-red-50/80 text-red-950"
                    : "border-amber-200 bg-amber-50/80 text-amber-950"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    {top.isRejected
                      ? "Flagged Repeat Posting · Previously Rejected"
                      : "Existing Pipeline Application Detected"}
                  </span>
                </div>
                <p className="mt-1">
                  Matches <strong>{top.app.role}</strong> at{" "}
                  <strong>{top.app.company}</strong> ({top.reasonLabel.toLowerCase()})
                  {top.isRejected ? (
                    <>
                      {" "}· Rejected
                      {top.app.rejectedAt ? ` on ${top.app.rejectedAt}` : ""}
                      {top.app.rejectionStage
                        ? ` after ${top.app.rejectionStage}`
                        : ""}
                    </>
                  ) : (
                    <> · Stage: {top.app.stage}</>
                  )}
                  .
                </p>
                {(top.app.rejectionNotes || top.app.notes) && (
                  <p className="mt-1 opacity-90">
                    Prior note: {top.app.rejectionNotes || top.app.notes}
                  </p>
                )}
              </div>
            );
          })()}

          {importedPreview && (
            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Company
                  </label>
                  <input
                    type="text"
                    value={importedPreview.company}
                    onChange={(e) =>
                      setImportedPreview({
                        ...importedPreview,
                        company: sanitizeDashes(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Role Title
                  </label>
                  <input
                    type="text"
                    value={importedPreview.role}
                    onChange={(e) =>
                      setImportedPreview({
                        ...importedPreview,
                        role: sanitizeDashes(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Source / Location
                  </label>
                  <input
                    type="text"
                    value={importedPreview.location}
                    onChange={(e) =>
                      setImportedPreview({
                        ...importedPreview,
                        location: sanitizeDashes(e.target.value),
                      })
                    }
                    placeholder="Remote / City"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Extracted Job Description
                </label>
                <textarea
                  value={importedPreview.jobDescription}
                  onChange={(e) =>
                    setImportedPreview({
                      ...importedPreview,
                      jobDescription: sanitizeDashes(e.target.value),
                    })
                  }
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    saveDiscoveredJob(
                      {
                        company: importedPreview.company,
                        role: importedPreview.role,
                        location: importedPreview.location,
                        boardSource: importedPreview.source,
                        jobUrl: importedPreview.jobUrl,
                        jobDescription: importedPreview.jobDescription,
                      },
                      false
                    )
                  }
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  {previewMatches.some((m) => m.isRejected)
                    ? "Save Repost to Pipeline Anyway"
                    : "Save to Pipeline"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    saveDiscoveredJob(
                      {
                        company: importedPreview.company,
                        role: importedPreview.role,
                        location: importedPreview.location,
                        boardSource: importedPreview.source,
                        jobUrl: importedPreview.jobUrl,
                        jobDescription: importedPreview.jobDescription,
                      },
                      true
                    )
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  {previewMatches.some((m) => m.isRejected)
                    ? "Save Repost & Tailor Anyway"
                    : "Save & Tailor Resume Now"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Status Line */}
      {statusMessage && (
        <div className="text-xs text-slate-600">{statusMessage}</div>
      )}

      {/* Live Job Feed Results List (shown for Public Job Feeds & ATS Company Boards) */}
      {(mode === "boards" || mode === "ats") && (
        <section className="space-y-3">
          {jobs.length === 0 && !loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <h3 className="text-sm font-semibold text-slate-900">
                Ready to search live job boards
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                Click <strong>Search Boards</strong> above (or select a pinned ATS company board) to pull real open roles with instant Master Resume skill-overlap previews.
              </p>
            </div>
          ) : (() => {
            const enrichedJobs = jobs.map((job) => {
              const priorMatches = findPriorJobMatches(
                {
                  company: job.company,
                  role: job.role,
                  jobUrl: job.jobUrl,
                  jobDescription: job.jobDescription,
                },
                applications
              );
              const priorRejected = priorMatches.find((m) => m.isRejected) || null;
              const priorOther = priorMatches.find((m) => !m.isRejected) || null;
              return { job, priorRejected, priorOther };
            });

            const rejectedHitCount = enrichedJobs.filter(
              (item) => item.priorRejected !== null
            ).length;
            const visibleItems = hidePreviouslyRejected
              ? enrichedJobs.filter((item) => item.priorRejected === null)
              : enrichedJobs;

            return (
              <div className="space-y-3">
                {rejectedHitCount > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/70 px-4 py-2.5 text-xs text-red-950">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-700" />
                      <span>
                        <strong className="font-mono tabular-nums">
                          {rejectedHitCount}
                        </strong>{" "}
                        {rejectedHitCount === 1
                          ? "posting in these results matches"
                          : "postings in these results match"}{" "}
                        a role where you were previously rejected.
                      </span>
                    </div>
                    <label className="inline-flex items-center gap-1.5 font-medium text-red-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hidePreviouslyRejected}
                        onChange={(e) => setHidePreviouslyRejected(e.target.checked)}
                        className="rounded border-red-300 text-red-700"
                      />
                      Hide previously rejected roles
                    </label>
                  </div>
                )}

                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  {visibleItems.map(({ job, priorRejected, priorOther }) => {
                    const overlap = computeQuickSkillOverlap(job.jobDescription);
                    const justAdded = Boolean(addedIds[job.externalId]);
                    const inActiveOrOtherPipeline =
                      justAdded || Boolean(priorOther);
                    const isExpanded = expandedJobId === job.externalId;

                    return (
                      <article
                        key={job.externalId}
                        className={`p-5 ${
                          priorRejected && !justAdded ? "bg-red-50/25" : ""
                        }`}
                      >
                        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                          <div className="min-w-0 flex-1">
                            {/* Unboxed metadata row */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                              <span className="font-medium text-slate-700">
                                {job.company}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{job.location || "Flexible"}</span>
                              <span aria-hidden="true">·</span>
                              <span>{job.boardSource}</span>
                              {job.publishedAt && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    {job.publishedAt}
                                  </span>
                                </>
                              )}
                            </div>

                            <h3 className="mt-1 text-base font-semibold text-slate-900">
                              {job.role}
                            </h3>

                            {priorRejected && (
                              <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-800">
                                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700" />
                                <span>
                                  <strong>Flagged · Previously Rejected:</strong>{" "}
                                  {priorRejected.app.role} (
                                  {priorRejected.reasonLabel.toLowerCase()})
                                  {priorRejected.app.rejectedAt
                                    ? ` on ${priorRejected.app.rejectedAt}`
                                    : ""}
                                  {priorRejected.app.rejectionStage
                                    ? ` after ${priorRejected.app.rejectionStage}`
                                    : ""}
                                  {priorRejected.app.rejectionNotes
                                    ? ` · "${priorRejected.app.rejectionNotes}"`
                                    : ""}
                                </span>
                              </div>
                            )}

                            {masterResume.skills.length > 0 && (
                              <div className="mt-1.5 text-xs text-slate-600">
                                Master Resume overlap:{" "}
                                <span className="font-mono font-semibold tabular-nums text-slate-900">
                                  {overlap.score}%
                                </span>
                                {overlap.matched.length > 0 && (
                                  <span className="text-emerald-800">
                                    {" "}
                                    ({overlap.matched.slice(0, 5).join(", ")})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedJobId(
                                  isExpanded ? null : job.externalId
                                )
                              }
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              {isExpanded ? "Hide Description" : "Preview JD"}
                            </button>

                            {job.jobUrl && (
                              <a
                                href={job.jobUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Source <ExternalLink className="h-3 w-3" />
                              </a>
                            )}

                            {justAdded || inActiveOrOtherPipeline ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-emerald-800">
                                <Check className="h-3.5 w-3.5" /> In Pipeline
                                {priorOther ? ` (${priorOther.app.stage})` : ""}
                              </span>
                            ) : priorRejected ? (
                              <button
                                type="button"
                                onClick={() => saveDiscoveredJob(job, false)}
                                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                              >
                                Save Repost Anyway
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => saveDiscoveredJob(job, false)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                                >
                                  + Save Role
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveDiscoveredJob(job, true)}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                                >
                                  Save & Tailor
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                            {job.jobDescription ||
                              "No full text provided by board."}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
};
