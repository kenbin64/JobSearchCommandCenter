import React, { useMemo, useState } from "react";
import {
  ActivityLogCategory,
  ActivityLogEntry,
  ApplicationRecord,
  ApplicationStage,
  InterviewRecord,
  TimelineEvent,
  TimelineEventType,
} from "../types";
import { parseLocalIsoDate, sanitizeDashes, todayIsoDate } from "../engine";
import {
  AlertCircle,
  ArrowRight,
  Download,
  ShieldCheck,
  Trash2,
} from "lucide-react";

interface MomentumViewProps {
  applications: ApplicationRecord[];
  events: TimelineEvent[];
  interviews: InterviewRecord[];
  activityLog?: ActivityLogEntry[];
  retentionDays?: number;
  rawBrainstormCount?: number;
  onChangeRetentionDays?: (days: number) => void;
  onClearActivityLog?: () => void;
  onScrubRawBrainstorms?: () => void;
  onWipeAllLocalData?: () => void;
  onNavigatePipeline: () => void;
}

export const MomentumView: React.FC<MomentumViewProps> = ({
  applications,
  events,
  interviews,
  activityLog = [],
  retentionDays = 0,
  rawBrainstormCount = 0,
  onChangeRetentionDays,
  onClearActivityLog,
  onScrubRawBrainstorms,
  onWipeAllLocalData,
  onNavigatePipeline,
}) => {
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<"all" | ActivityLogCategory>(
    "all"
  );
  const [confirmWipeAll, setConfirmWipeAll] = useState(false);
  const stats = useMemo(() => {
    const today = parseLocalIsoDate(todayIsoDate()) || new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);

    const eventsThisWeek = events.filter((e) => {
      const d = parseLocalIsoDate(e.date);
      return d && d >= sevenDaysAgo && d <= today;
    });

    const sentThisWeek = eventsThisWeek.filter(
      (e) => e.type === TimelineEventType.Applied
    ).length;

    const repliesThisWeek = eventsThisWeek.filter(
      (e) => e.type === TimelineEventType.Contact || e.type === TimelineEventType.Offer
    ).length;

    const interviewsThisWeek = interviews.filter((i) => {
      const d = parseLocalIsoDate(i.date);
      return d && d >= sevenDaysAgo && d <= today;
    }).length;

    const stageAdvancementsThisWeek = applications.filter((a) => {
      const d = parseLocalIsoDate(a.updatedAt);
      const isAdvanced =
        a.stage === ApplicationStage.RecruiterScreen ||
        a.stage === ApplicationStage.TechnicalInterview ||
        a.stage === ApplicationStage.FinalInterview ||
        a.stage === ApplicationStage.Offer;
      return isAdvanced && d && d >= sevenDaysAgo;
    }).length;

    // Quiet Period Warning calculation
    let daysSinceAnyEvent: number | null = null;
    if (events.length > 0) {
      const sortedDates = events
        .map((e) => parseLocalIsoDate(e.date))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime());
      if (sortedDates[0]) {
        daysSinceAnyEvent = Math.max(
          0,
          Math.floor(
            (today.getTime() - sortedDates[0].getTime()) / (1000 * 60 * 60 * 24)
          )
        );
      }
    }

    // Self-grade progression sorted chronologically
    const sortedInterviews = [...interviews].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const avgGrade =
      sortedInterviews.length > 0
        ? (
            sortedInterviews.reduce((acc, i) => acc + i.selfGrade, 0) /
            sortedInterviews.length
          ).toFixed(1)
        : "-";

    // Topic tag breakdown: tags logged on high-grade rounds (4-5) vs lower-grade or improvement-flagged rounds
    const highlightTopics: Record<string, number> = {};
    const improveTopics: Record<string, number> = {};

    sortedInterviews.forEach((intRec) => {
      intRec.questions.forEach((q) => {
        const tag = q.topic.trim() || "General";
        if (intRec.selfGrade >= 4 && intRec.highlights.trim().length > 0) {
          highlightTopics[tag] = (highlightTopics[tag] || 0) + 1;
        }
        if (intRec.selfGrade <= 3 || intRec.improvements.trim().length > 0) {
          improveTopics[tag] = (improveTopics[tag] || 0) + 1;
        }
      });
    });

    return {
      sentThisWeek,
      repliesThisWeek,
      interviewsThisWeek,
      stageAdvancementsThisWeek,
      daysSinceAnyEvent,
      sortedInterviews,
      avgGrade,
      highlightTopics,
      improveTopics,
      totalApplications: applications.length,
    };
  }, [applications, events, interviews]);

  const showQuietWarning =
    stats.daysSinceAnyEvent !== null && stats.daysSinceAnyEvent >= 7;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <div className="text-xs text-slate-500">
          Derived on read from dated timeline events and interview debriefs
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Reflection & Momentum Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Measure weekly search velocity, stage progression, interview self-grades, and recurring technical or behavioral topics.
        </p>
      </div>

      {/* Quiet Period Gentle Prompt (only when 7+ days have elapsed since last event) */}
      {showQuietWarning && (
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
            <div className="text-xs text-amber-900">
              <strong>Quiet period:</strong> {stats.daysSinceAnyEvent} days since your last logged event. Suggested: Pick one Saved role to tailor, or check in on roles waiting 7+ days.
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigatePipeline}
            className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-3 py-1 text-xs font-medium text-white hover:bg-amber-950 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Pipeline <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Weekly Velocity Strip (4 structured KPI cells) */}
      <section className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <div className="p-5">
          <div className="text-xs text-slate-500">Applications Sent (7d)</div>
          <div className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {stats.sentThisWeek}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="font-mono tabular-nums">{stats.totalApplications}</span> total in pipeline
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Replies Received (7d)</div>
          <div className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {stats.repliesThisWeek}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Outreach & recruiter responses
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Interviews Completed (7d)</div>
          <div className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {stats.interviewsThisWeek}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="font-mono tabular-nums">{stats.sortedInterviews.length}</span> total rounds logged
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Stage Advancements (7d)</div>
          <div className="mt-2 font-mono text-3xl font-bold tabular-nums text-blue-600">
            {stats.stageAdvancementsThisWeek}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Roles active in interview/offer stages
          </div>
        </div>
      </section>

      {/* Self-Grade Trajectory & Topic Tag Mastery */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Interview Self-Grade Trend */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Interview Self-Grade Trajectory
              </h2>
              <p className="text-xs text-slate-500">
                Chronological 1 to 5 score progression across logged interview rounds
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Average Score</div>
              <div className="font-mono text-xl font-bold tabular-nums text-slate-900">
                {stats.avgGrade} <span className="text-xs font-normal text-slate-400">/ 5.0</span>
              </div>
            </div>
          </div>

          {stats.sortedInterviews.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No interview debriefs logged yet. Open any application in the Pipeline tab and click "Log Interview".
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {stats.sortedInterviews.map((intRec) => {
                const app = applications.find((a) => a.id === intRec.applicationId);
                const pct = (intRec.selfGrade / 5) * 100;
                return (
                  <div key={intRec.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-900">
                          {app ? `${app.company} (${intRec.type})` : intRec.type}
                        </span>
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {intRec.date}
                        </span>
                      </div>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        {intRec.selfGrade} / 5
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-transform"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {intRec.highlights && (
                      <p className="mt-2 text-xs text-slate-600">
                        <strong className="text-slate-800">Landed well:</strong>{" "}
                        {intRec.highlights}
                      </p>
                    )}
                    {intRec.improvements && (
                      <p className="mt-1 text-xs text-slate-600">
                        <strong className="text-slate-800">Refine next:</strong>{" "}
                        {intRec.improvements}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Question Topic Analysis */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <h2 className="border-b border-slate-200 pb-3 text-base font-semibold text-slate-900">
            Question Topic Analysis
          </h2>

          <div className="mt-4 space-y-5">
            <div>
              <h3 className="text-xs font-semibold text-emerald-800">
                Topics Logged Under Highlights
              </h3>
              <p className="text-xs text-slate-500">
                Question categories from high-scoring rounds
              </p>
              {Object.keys(stats.highlightTopics).length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No highlight topics recorded yet.</p>
              ) : (
                <div className="mt-2.5 divide-y divide-slate-100 border-t border-slate-100">
                  {Object.entries(stats.highlightTopics)
                    .sort((a, b) => b[1] - a[1])
                    .map(([topic, count]) => (
                      <div
                        key={topic}
                        className="flex items-center justify-between py-2 text-xs"
                      >
                        <span className="text-slate-800">{topic}</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {count} {count === 1 ? "question" : "questions"}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-xs font-semibold text-amber-800">
                Topics Paired With Areas to Improve
              </h3>
              <p className="text-xs text-slate-500">
                Focus rehearsal time on these recurring themes
              </p>
              {Object.keys(stats.improveTopics).length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No improvement topics recorded yet.</p>
              ) : (
                <div className="mt-2.5 divide-y divide-slate-100 border-t border-slate-100">
                  {Object.entries(stats.improveTopics)
                    .sort((a, b) => b[1] - a[1])
                    .map(([topic, count]) => (
                      <div
                        key={topic}
                        className="flex items-center justify-between py-2 text-xs"
                      >
                        <span className="text-slate-800">{topic}</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {count} {count === 1 ? "question" : "questions"}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Unified Local Activity Log & Data Retention Policy */}
      {(() => {
        const unifiedRows: Array<{
          id: string;
          sortTime: number;
          displayDate: string;
          category: ActivityLogCategory;
          summary: string;
        }> = [
          ...activityLog.map((entry) => {
            const parsed = Date.parse(entry.timestamp);
            const displayDate = Number.isNaN(parsed)
              ? entry.timestamp
              : entry.timestamp.slice(0, 16).replace("T", " ");
            return {
              id: entry.id,
              sortTime: Number.isNaN(parsed) ? 0 : parsed,
              displayDate,
              category: entry.category,
              summary: entry.summary,
            };
          }),
          ...events.map((evt) => {
            const app = applications.find((a) => a.id === evt.applicationId);
            const parsed = Date.parse(`${evt.date}T12:00:00`);
            return {
              id: `evt_row_${evt.id}`,
              sortTime: Number.isNaN(parsed) ? evt.sequence || 0 : parsed,
              displayDate: evt.date,
              category: "pipeline" as ActivityLogCategory,
              summary: `${evt.type}${
                app ? ` · ${app.role} at ${app.company}` : ""
              }${evt.notes ? ` - ${evt.notes}` : ""}`,
            };
          }),
          ...interviews.map((intRec) => {
            const app = applications.find((a) => a.id === intRec.applicationId);
            const parsed = Date.parse(`${intRec.date}T15:00:00`);
            return {
              id: `int_row_${intRec.id}`,
              sortTime: Number.isNaN(parsed) ? 0 : parsed,
              displayDate: intRec.date,
              category: "interview" as ActivityLogCategory,
              summary: `${intRec.type} Interview${
                app ? ` · ${app.company}` : ""
              } (Self-grade ${intRec.selfGrade}/5)${
                intRec.highlights ? ` - ${intRec.highlights}` : ""
              }`,
            };
          }),
        ].sort((a, b) => b.sortTime - a.sortTime);

        const q = logSearch.trim().toLowerCase();
        const filteredRows = unifiedRows.filter((row) => {
          if (logFilter !== "all" && row.category !== logFilter) return false;
          if (!q) return true;
          return (
            row.summary.toLowerCase().includes(q) ||
            row.category.toLowerCase().includes(q) ||
            row.displayDate.toLowerCase().includes(q)
          );
        });

        const handleExportCsvLog = () => {
          const header = "Date,Category,Summary";
          const lines = filteredRows.map((r) => {
            const safeSummary = sanitizeDashes(r.summary).replace(/"/g, '""');
            return `"${r.displayDate}","${r.category}","${safeSummary}"`;
          });
          const blob = new Blob([[header, ...lines].join("\n")], {
            type: "text/csv;charset=utf-8",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `job_search_activity_log_${todayIsoDate()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        };

        return (
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                  <span>
                    Local-Only Retention Model · Zero Server-Side Database or File Storage
                  </span>
                </div>
                <h2 className="mt-1 text-base font-semibold text-slate-900">
                  Local Activity Log & Data Retention Controls
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  All pipeline events, interview debriefs, resume versions, and activity logs stay strictly in your browser&apos;s LocalStorage (and your exported <code>.json</code> backups). Nothing is retained on the server.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onChangeRetentionDays && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="local-retention-select"
                      className="text-xs font-medium text-slate-700 whitespace-nowrap"
                    >
                      Log Retention:
                    </label>
                    <select
                      id="local-retention-select"
                      value={retentionDays}
                      onChange={(e) =>
                        onChangeRetentionDays(Number(e.target.value) || 0)
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none"
                    >
                      <option value={0}>Keep Indefinitely</option>
                      <option value={30}>Auto-prune &gt; 30d</option>
                      <option value={90}>Auto-prune &gt; 90d</option>
                      <option value={180}>Auto-prune &gt; 180d</option>
                      <option value={365}>Auto-prune &gt; 365d</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleExportCsvLog}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  Export Log (.csv)
                </button>
              </div>
            </div>

            {/* Filter & Privacy Hygiene Toolbar */}
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search logged events, companies, skills, or actions..."
                  className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                />
                <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {(
                    [
                      ["all", "All"],
                      ["pipeline", "Pipeline"],
                      ["interview", "Interviews"],
                      ["resume", "Resume"],
                      ["tailoring", "Tailoring"],
                      ["backup", "Backups"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setLogFilter(val)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        logFilter === val
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onScrubRawBrainstorms && rawBrainstormCount > 0 && (
                  <button
                    type="button"
                    onClick={onScrubRawBrainstorms}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                    title="Deletes private raw brainstorm notes while keeping converted NDA-safe resume bullets"
                  >
                    Scrub Raw Brainstorms ({rawBrainstormCount})
                  </button>
                )}

                {onClearActivityLog && activityLog.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearActivityLog}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                  >
                    Clear Action Log
                  </button>
                )}

                {onWipeAllLocalData &&
                  (!confirmWipeAll ? (
                    <button
                      type="button"
                      onClick={() => setConfirmWipeAll(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Purge Browser Storage
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onWipeAllLocalData();
                          setConfirmWipeAll(false);
                        }}
                        className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap cursor-pointer"
                      >
                        Confirm Purge All
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmWipeAll(false)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            {/* Chronological Data Grid */}
            {filteredRows.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No matching entries in your local log.
              </p>
            ) : (
              <div className="overflow-x-auto border-t border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-4 font-medium whitespace-nowrap">
                        Date / Timestamp
                      </th>
                      <th className="py-2.5 pr-4 font-medium whitespace-nowrap">
                        Category
                      </th>
                      <th className="py-2.5 font-medium">Logged Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.slice(0, 60).map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {row.displayDate}
                        </td>
                        <td className="py-2.5 pr-4 font-medium capitalize text-slate-700 whitespace-nowrap">
                          {row.category}
                        </td>
                        <td className="py-2.5 text-slate-800">{row.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })()}
    </div>
  );
};
