/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityLogCategory,
  ActivityLogEntry,
  AppState,
  ApplicationRecord,
  ApplicationStage,
  ClosedReason,
  InterviewRecord,
  MasterResume,
  SavedBoardConnection,
  TailoredWorkspace,
  TimelineEvent,
  TimelineEventType,
} from "./types";
import {
  createDefaultState,
  createDemoState,
  sanitizeDashes,
  todayIsoDate,
} from "./engine";
import {
  clearLocalStorageState,
  loadAppState,
  pruneActivityLogByRetention,
  saveAppState,
} from "./storage";
import { downloadResumePdf } from "./pdfGenerator";
import { PipelineView } from "./components/PipelineView";
import { JobBoardsView } from "./components/JobBoardsView";
import { MasterResumeView } from "./components/MasterResumeView";
import { MatchTailorView } from "./components/MatchTailorView";
import { MomentumView } from "./components/MomentumView";
import { HowToUseGuide } from "./components/HowToUseGuide";
import { BookOpen, FileDown, FileUp, Plus, X } from "lucide-react";

type ActiveTab =
  | "pipeline"
  | "boards"
  | "resume"
  | "match"
  | "momentum"
  | "guide";

export default function App() {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>("pipeline");
  const [selectedMatchAppId, setSelectedMatchAppId] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string>("");
  const [isGuideModalOpen, setIsGuideModalOpen] = useState<boolean>(false);

  const triggerNewAppModalRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? "" : prev));
    }, 3200);
  };

  const makeLogEntry = (
    category: ActivityLogCategory,
    summary: string
  ): ActivityLogEntry => ({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    category,
    summary: sanitizeDashes(summary),
  });

  const handleSaveApplication = (
    app: ApplicationRecord,
    initialEvent?: TimelineEvent
  ) => {
    const isRejected =
      app.stage === ApplicationStage.Closed &&
      app.stageReason === ClosedReason.Rejected;
    setState((prev) => {
      const prevApp = prev.applications.find((a) => a.id === app.id);
      const exists = Boolean(prevApp);
      const wasRejected =
        prevApp?.stage === ApplicationStage.Closed &&
        prevApp?.stageReason === ClosedReason.Rejected;
      const nextApps = exists
        ? prev.applications.map((a) => (a.id === app.id ? app : a))
        : [app, ...prev.applications];
      const nextEvents = initialEvent
        ? [...prev.events, initialEvent]
        : prev.events;
      const summaryText =
        isRejected && !wasRejected
          ? `Marked ${app.role} at ${app.company} as Rejected${
              app.rejectionStage && app.rejectionStage !== ApplicationStage.Closed
                ? ` (after ${app.rejectionStage})`
                : ""
            }.`
          : exists
          ? `Updated ${app.role} at ${app.company} (Stage: ${app.stage}${
              isRejected ? " · Rejected" : ""
            }).`
          : `Added ${app.role} at ${app.company} (${app.stage}${
              isRejected ? " · Rejected" : ""
            }).`;
      const logEntry = makeLogEntry("pipeline", summaryText);
      return {
        ...prev,
        applications: nextApps,
        events: nextEvents,
        activityLog: [logEntry, ...(prev.activityLog || [])],
      };
    });
    showToast(
      isRejected
        ? `Marked ${app.role} at ${app.company} as Rejected. Will flag if it comes up again.`
        : "Application saved locally."
    );
  };

  const handleImportJobFromBoard = (
    app: ApplicationRecord,
    evt: TimelineEvent,
    openInTailor: boolean
  ) => {
    setState((prev) => ({
      ...prev,
      applications: [app, ...prev.applications],
      events: [...prev.events, evt],
      activityLog: [
        makeLogEntry(
          "pipeline",
          `Imported ${app.role} at ${app.company} from ${app.source || "Job Board"}.`
        ),
        ...(prev.activityLog || []),
      ],
    }));

    if (openInTailor) {
      setSelectedMatchAppId(app.id);
      setActiveTab("match");
      showToast(`Imported ${app.role} at ${app.company} into Match & Tailor.`);
    } else {
      showToast(`Saved ${app.role} at ${app.company} to Pipeline.`);
    }
  };

  const handleUpdateSavedBoards = (boards: SavedBoardConnection[]) => {
    setState((prev) => ({
      ...prev,
      savedBoards: boards,
    }));
  };

  const handleDeleteApplication = (appId: string) => {
    setState((prev) => {
      const target = prev.applications.find((a) => a.id === appId);
      const nextTailored = { ...prev.tailoredByApp };
      delete nextTailored[appId];
      return {
        ...prev,
        applications: prev.applications.filter((a) => a.id !== appId),
        events: prev.events.filter((e) => e.applicationId !== appId),
        interviews: prev.interviews.filter((i) => i.applicationId !== appId),
        tailoredByApp: nextTailored,
        activityLog: [
          makeLogEntry(
            "pipeline",
            target
              ? `Removed ${target.role} at ${target.company} from Pipeline.`
              : "Removed application from Pipeline."
          ),
          ...(prev.activityLog || []),
        ],
      };
    });
    showToast("Application removed.");
  };

  const handleAddEvent = (evt: TimelineEvent) => {
    setState((prev) => ({
      ...prev,
      events: [...prev.events, evt],
    }));
  };

  const handleUpdateEvent = (updatedEvt: TimelineEvent) => {
    setState((prev) => ({
      ...prev,
      events: prev.events.map((e) => (e.id === updatedEvt.id ? updatedEvt : e)),
    }));
    showToast("Timeline event updated.");
  };

  const handleDeleteEvent = (evtId: string) => {
    setState((prev) => ({
      ...prev,
      events: prev.events.filter((e) => e.id !== evtId),
    }));
  };

  const handleAddInterview = (intRecord: InterviewRecord) => {
    setState((prev) => ({
      ...prev,
      interviews: [...prev.interviews, intRecord],
      activityLog: [
        makeLogEntry(
          "interview",
          `Logged ${intRecord.type} debrief (${intRecord.date}, self-grade ${intRecord.selfGrade}/5).`
        ),
        ...(prev.activityLog || []),
      ],
    }));
    showToast("Interview debrief saved.");
  };

  const handleUpdateInterview = (updatedInt: InterviewRecord) => {
    setState((prev) => ({
      ...prev,
      interviews: prev.interviews.map((i) =>
        i.id === updatedInt.id ? updatedInt : i
      ),
    }));
    showToast("Interview debrief updated.");
  };

  const handleDeleteInterview = (intId: string) => {
    setState((prev) => ({
      ...prev,
      interviews: prev.interviews.filter((i) => i.id !== intId),
    }));
    showToast("Interview debrief removed.");
  };

  const handleUpdateMasterResume = (updated: MasterResume) => {
    setState((prev) => {
      const skillDiff = updated.skills.length - prev.masterResume.skills.length;
      const shouldLogSkillAdd = skillDiff > 0;
      const nextLog = shouldLogSkillAdd
        ? [
            makeLogEntry(
              "resume",
              `Added ${skillDiff} confirmed skill${
                skillDiff === 1 ? "" : "s"
              } to Master Resume (${updated.skills.length} total).`
            ),
            ...(prev.activityLog || []),
          ]
        : prev.activityLog || [];
      return {
        ...prev,
        masterResume: updated,
        activityLog: nextLog,
      };
    });
  };

  const handleSaveTailoredWorkspace = (
    appId: string,
    workspace: TailoredWorkspace
  ) => {
    setState((prev) => {
      const app = prev.applications.find((a) => a.id === appId);
      const prevWs = prev.tailoredByApp[appId];
      const shouldLog =
        !prevWs || prevWs.matchScore !== workspace.matchScore;
      return {
        ...prev,
        tailoredByApp: {
          ...prev.tailoredByApp,
          [appId]: workspace,
        },
        activityLog: shouldLog
          ? [
              makeLogEntry(
                "tailoring",
                `Updated tailored match for ${
                  app ? `${app.role} at ${app.company}` : "application"
                } (Weighted score: ${workspace.matchScore}/100).`
              ),
              ...(prev.activityLog || []),
            ]
          : prev.activityLog || [],
      };
    });
  };

  const handleUpdateJobDescription = (appId: string, jd: string) => {
    setState((prev) => ({
      ...prev,
      applications: prev.applications.map((a) =>
        a.id === appId ? { ...a, jobDescription: jd } : a
      ),
    }));
  };

  const handleCreateQuickApplication = (
    company: string,
    role: string,
    jobDescription: string
  ) => {
    const id = `app_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const newApp: ApplicationRecord = {
      id,
      company: sanitizeDashes(company.trim()),
      role: sanitizeDashes(role.trim()),
      contactName: "",
      contactEmail: "",
      source: "Match & Tailor Studio",
      jobUrl: "",
      stage: ApplicationStage.Saved,
      stageReason: ClosedReason.None,
      jobDescription: sanitizeDashes(jobDescription.trim()),
      notes: "",
      createdAt: todayIsoDate(),
      updatedAt: nowIso,
    };
    const initialEvt: TimelineEvent = {
      id: `evt_${Date.now()}`,
      applicationId: id,
      date: todayIsoDate(),
      type: TimelineEventType.Note,
      notes: "Created target role in Match & Tailor Studio",
      sequence: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      applications: [newApp, ...prev.applications],
      events: [...prev.events, initialEvt],
    }));
    setSelectedMatchAppId(id);
    showToast(`Added ${newApp.role} at ${newApp.company} for tailoring.`);
  };

  const handleLoadDemoData = () => {
    const demo = createDemoState();
    setState(demo);
    setSelectedMatchAppId(demo.applications[0]?.id || "");
    showToast(
      "Loaded sample Master Resume, 4 applications (1 Rejected), pinned ATS boards, and 2 interview logs."
    );
  };

  const handleExportAllData = () => {
    const loggedState: AppState = {
      ...state,
      activityLog: [
        makeLogEntry("backup", "Exported full local JSON workspace backup."),
        ...(state.activityLog || []),
      ],
    };
    setState(loggedState);
    const jsonString = JSON.stringify(loggedState, null, 2);
    const blob = new Blob([jsonString], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job_search_command_center_${todayIsoDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported JSON backup.");
  };

  const handleImportAllData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || "");
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") {
          showToast("Invalid JSON backup format.");
          return;
        }
        const cleaned = saveAppState({
          ...(parsed as AppState),
          activityLog: [
            makeLogEntry(
              "backup",
              `Restored full workspace from ${file.name}.`
            ),
            ...(((parsed as AppState).activityLog as ActivityLogEntry[]) || []),
          ],
        });
        setState(cleaned);
        showToast("Full application state restored from JSON.");
      } catch {
        showToast("Could not parse JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const handleChangeRetentionDays = (days: number) => {
    setState((prev) => {
      const pruned = pruneActivityLogByRetention(prev.activityLog || [], days);
      return {
        ...prev,
        retentionDays: days,
        activityLog: [
          makeLogEntry(
            "retention",
            days === 0
              ? "Set local log retention policy to Keep Indefinitely."
              : `Set local log auto-prune window to ${days} days.`
          ),
          ...pruned,
        ],
      };
    });
    showToast(
      days === 0
        ? "Retention set to Keep Indefinitely."
        : `Local log auto-prune set to ${days} days.`
    );
  };

  const handleClearActivityLog = () => {
    setState((prev) => ({
      ...prev,
      activityLog: [],
    }));
    showToast("Cleared local action log.");
  };

  const handleScrubRawBrainstorms = () => {
    setState((prev) => ({
      ...prev,
      masterResume: {
        ...prev.masterResume,
        experience: prev.masterResume.experience.map((e) => ({
          ...e,
          rawBrainstorm: "",
        })),
      },
      activityLog: [
        makeLogEntry(
          "retention",
          "Scrubbed private raw brainstorm scratchpads while keeping converted NDA-safe bullets."
        ),
        ...(prev.activityLog || []),
      ],
    }));
    showToast("Scrubbed private raw brainstorm notes.");
  };

  const handleWipeAllLocalData = () => {
    clearLocalStorageState();
    setState(createDefaultState());
    setSelectedMatchAppId("");
    showToast("Purged all local browser storage.");
  };

  const handleOpenMatchStudio = (appId: string) => {
    setSelectedMatchAppId(appId);
    setActiveTab("match");
  };

  const handleHeaderPrimaryCta = () => {
    if (activeTab !== "pipeline") {
      setActiveTab("pipeline");
      setTimeout(() => {
        triggerNewAppModalRef.current?.();
      }, 30);
    } else {
      triggerNewAppModalRef.current?.();
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab("pipeline")}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Job Search Command Center
          </button>

          {/* Zone 2: 5 Clean Single-Line Text Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("pipeline")}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "pipeline"
                  ? "border-blue-600 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("boards")}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "boards"
                  ? "border-blue-600 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Job Boards
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("resume")}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "resume"
                  ? "border-blue-600 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Master Resume
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("match")}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "match"
                  ? "border-blue-600 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Match & Tailor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("momentum")}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "momentum"
                  ? "border-blue-600 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Momentum
            </button>
          </nav>

          {/* Zone 3: Actions - Quick Guide trigger & Primary Action Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
              title="Open quick-start workflow & PDF guide"
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-600" />
              Guide
            </button>
            <button
              type="button"
              onClick={handleHeaderPrimaryCta}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              New Application
            </button>
          </div>
        </div>

        {/* Mobile Secondary Tab Row */}
        <div className="flex items-center gap-4 overflow-x-auto border-t border-slate-100 px-6 py-2 text-xs font-medium md:hidden">
          <button
            type="button"
            onClick={() => setActiveTab("pipeline")}
            className={`whitespace-nowrap shrink-0 ${
              activeTab === "pipeline" ? "font-semibold text-blue-600" : "text-slate-600"
            }`}
          >
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("boards")}
            className={`whitespace-nowrap shrink-0 ${
              activeTab === "boards" ? "font-semibold text-blue-600" : "text-slate-600"
            }`}
          >
            Job Boards
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("resume")}
            className={`whitespace-nowrap shrink-0 ${
              activeTab === "resume" ? "font-semibold text-blue-600" : "text-slate-600"
            }`}
          >
            Master Resume
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("match")}
            className={`whitespace-nowrap shrink-0 ${
              activeTab === "match" ? "font-semibold text-blue-600" : "text-slate-600"
            }`}
          >
            Match & Tailor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("momentum")}
            className={`whitespace-nowrap shrink-0 ${
              activeTab === "momentum" ? "font-semibold text-blue-600" : "text-slate-600"
            }`}
          >
            Momentum
          </button>
          <button
            type="button"
            onClick={() => setIsGuideModalOpen(true)}
            className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-blue-600 font-medium"
          >
            <BookOpen className="h-3 w-3" />
            Guide
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">

        {/* Non-blocking status toast */}
        {toastMessage && (
          <div className="mb-5 rounded-lg border border-slate-200 bg-slate-900 px-4 py-2.5 text-xs font-medium text-white no-print">
            {toastMessage}
          </div>
        )}

        {activeTab === "pipeline" && (
          <PipelineView
            applications={state.applications}
            events={state.events}
            interviews={state.interviews}
            candidateName={state.masterResume.contact.name}
            masterResume={state.masterResume}
            tailoredByApp={state.tailoredByApp}
            onOpenMasterResume={() => setActiveTab("resume")}
            onSaveApplication={handleSaveApplication}
            onDeleteApplication={handleDeleteApplication}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            onAddInterview={handleAddInterview}
            onUpdateInterview={handleUpdateInterview}
            onDeleteInterview={handleDeleteInterview}
            onOpenMatchStudio={handleOpenMatchStudio}
            onLoadDemo={handleLoadDemoData}
            onExportJson={handleExportAllData}
            onImportJson={handleImportAllData}
            triggerNewModalRef={triggerNewAppModalRef}
          />
        )}

        {activeTab === "boards" && (
          <JobBoardsView
            masterResume={state.masterResume}
            applications={state.applications}
            savedBoards={state.savedBoards}
            onUpdateSavedBoards={handleUpdateSavedBoards}
            onImportJobToPipeline={handleImportJobFromBoard}
          />
        )}

        {activeTab === "resume" && (
          <MasterResumeView
            resume={state.masterResume}
            evaluation={state.resumeEvaluation || null}
            onSaveEvaluation={(report) =>
              setState((prev) => ({ ...prev, resumeEvaluation: report }))
            }
            onChange={handleUpdateMasterResume}
            onLoadDemo={handleLoadDemoData}
            onNavigateMatch={() => setActiveTab("match")}
          />
        )}

        {activeTab === "match" && (
          <MatchTailorView
            applications={state.applications}
            masterResume={state.masterResume}
            onUpdateMasterResume={handleUpdateMasterResume}
            selectedAppId={selectedMatchAppId}
            onSelectAppId={setSelectedMatchAppId}
            tailoredByApp={state.tailoredByApp}
            onSaveWorkspace={handleSaveTailoredWorkspace}
            onUpdateJobDescription={handleUpdateJobDescription}
            onUpdateApplication={(app) => handleSaveApplication(app)}
            onCreateQuickApplication={handleCreateQuickApplication}
            onNavigateResume={() => setActiveTab("resume")}
          />
        )}

        {activeTab === "momentum" && (
          <MomentumView
            applications={state.applications}
            events={state.events}
            interviews={state.interviews}
            activityLog={state.activityLog || []}
            retentionDays={state.retentionDays || 0}
            rawBrainstormCount={
              state.masterResume.experience.filter((e) =>
                Boolean(e.rawBrainstorm?.trim())
              ).length
            }
            onChangeRetentionDays={handleChangeRetentionDays}
            onClearActivityLog={handleClearActivityLog}
            onScrubRawBrainstorms={handleScrubRawBrainstorms}
            onWipeAllLocalData={handleWipeAllLocalData}
            onNavigatePipeline={() => setActiveTab("pipeline")}
          />
        )}

        {activeTab === "guide" && (
          <HowToUseGuide
            masterResume={state.masterResume}
            onNavigateTab={(t) => setActiveTab(t)}
            onLoadDemo={handleLoadDemoData}
          />
        )}
      </main>

      {/* Guide Slide-Over / Modal */}
      {isGuideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto no-print">
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              aria-label="Close Guide"
            >
              <X className="h-5 w-5" />
            </button>
            <HowToUseGuide
              masterResume={state.masterResume}
              onNavigateTab={(t) => {
                setActiveTab(t);
                setIsGuideModalOpen(false);
              }}
              onLoadDemo={() => {
                handleLoadDemoData();
                setIsGuideModalOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Clean Persistent Footer */}
      <footer className="border-t border-slate-200 bg-white no-print">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-4 text-xs text-slate-500 sm:flex-row">
          <div>
            Job Search Command Center · Local-first browser storage with truthful ATS & Hiring Manager workflows
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-blue-600 cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-600" />
              How to Use Guide
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
