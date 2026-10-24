import React, { useMemo, useState } from "react";
import {
  ApplicationRecord,
  ApplicationStage,
  ClosedReason,
  InterviewRecord,
  InterviewType,
  MasterResume,
  TailoredWorkspace,
  TimelineEvent,
  TimelineEventType,
} from "../types";
import {
  computeFollowUpStatus,
  findPriorJobMatches,
  generateCheckInDraft,
  isApplicationRejected,
  sanitizeDashes,
  todayIsoDate,
} from "../engine";
import { downloadResumePdf } from "../pdfGenerator";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FileUp,
  FolderOpen,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";

interface PipelineViewProps {
  applications: ApplicationRecord[];
  events: TimelineEvent[];
  interviews: InterviewRecord[];
  candidateName: string;
  masterResume: MasterResume;
  tailoredByApp?: Record<string, TailoredWorkspace>;
  onOpenMasterResume?: () => void;
  onSaveApplication: (app: ApplicationRecord, initialEvent?: TimelineEvent) => void;
  onDeleteApplication: (appId: string) => void;
  onAddEvent: (evt: TimelineEvent) => void;
  onUpdateEvent?: (evt: TimelineEvent) => void;
  onDeleteEvent: (evtId: string) => void;
  onAddInterview: (intRecord: InterviewRecord) => void;
  onUpdateInterview?: (intRecord: InterviewRecord) => void;
  onDeleteInterview?: (intId: string) => void;
  onOpenMatchStudio: (appId: string) => void;
  onLoadDemo: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  triggerNewModalRef?: React.MutableRefObject<(() => void) | null>;
}

const ALL_STAGES: ApplicationStage[] = [
  ApplicationStage.Saved,
  ApplicationStage.Applied,
  ApplicationStage.RecruiterScreen,
  ApplicationStage.TechnicalInterview,
  ApplicationStage.FinalInterview,
  ApplicationStage.Offer,
  ApplicationStage.Closed,
];

export const PipelineView: React.FC<PipelineViewProps> = ({
  applications,
  events,
  interviews,
  candidateName,
  masterResume,
  tailoredByApp,
  onOpenMasterResume,
  onSaveApplication,
  onDeleteApplication,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onAddInterview,
  onUpdateInterview,
  onDeleteInterview,
  onOpenMatchStudio,
  onLoadDemo,
  onExportJson,
  onImportJson,
  triggerNewModalRef,
}) => {
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [layoutMode, setLayoutMode] = useState<"kanban" | "board" | "list">("kanban");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Drag-and-drop Kanban states
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ApplicationStage | null>(null);

  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingApp, setEditingApp] = useState<ApplicationRecord | null>(null);

  // Form states for Create/Edit modal
  const [formCompany, setFormCompany] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formContactName, setFormContactName] = useState("");
  const [formContactEmail, setFormContactEmail] = useState("");
  const [formSource, setFormSource] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formStage, setFormStage] = useState<ApplicationStage>(ApplicationStage.Applied);
  const [formStageReason, setFormStageReason] = useState<ClosedReason>(ClosedReason.None);
  const [formRejectedAt, setFormRejectedAt] = useState<string>(todayIsoDate());
  const [formRejectionNotes, setFormRejectionNotes] = useState<string>("");
  const [formJd, setFormJd] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Detail Drawer sub-states
  const [evtDate, setEvtDate] = useState(todayIsoDate());
  const [evtType, setEvtType] = useState<TimelineEventType>(TimelineEventType.Contact);
  const [evtNotes, setEvtNotes] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEvtDate, setEditEvtDate] = useState("");
  const [editEvtType, setEditEvtType] = useState<TimelineEventType>(TimelineEventType.Contact);
  const [editEvtNotes, setEditEvtNotes] = useState("");
  const [checkInDraft, setCheckInDraft] = useState<string | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  // Interview log form inside drawer (create + edit)
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [intDate, setIntDate] = useState(todayIsoDate());
  const [intType, setIntType] = useState<InterviewType>(InterviewType.RecruiterScreen);
  const [intPeople, setIntPeople] = useState("");
  const [intGrade, setIntGrade] = useState<number>(4);
  const [intHighlights, setIntHighlights] = useState("");
  const [intImprovements, setIntImprovements] = useState("");
  const [intQuestionsRaw, setIntQuestionsRaw] = useState("");

  const openCreateModal = (initialStage: ApplicationStage = ApplicationStage.Applied) => {
    setEditingApp(null);
    setFormCompany("");
    setFormRole("");
    setFormContactName("");
    setFormContactEmail("");
    setFormSource("");
    setFormUrl("");
    setFormStage(initialStage);
    setFormStageReason(
      initialStage === ApplicationStage.Closed
        ? ClosedReason.Rejected
        : ClosedReason.None
    );
    setFormRejectedAt(todayIsoDate());
    setFormRejectionNotes("");
    setFormJd("");
    setFormNotes("");
    setIsEditorOpen(true);
  };

  if (triggerNewModalRef) {
    triggerNewModalRef.current = () => openCreateModal(ApplicationStage.Applied);
  }

  const openEditModal = (app: ApplicationRecord) => {
    setEditingApp(app);
    setFormCompany(app.company);
    setFormRole(app.role);
    setFormContactName(app.contactName);
    setFormContactEmail(app.contactEmail);
    setFormSource(app.source);
    setFormUrl(app.jobUrl);
    setFormStage(app.stage);
    setFormStageReason(app.stageReason || ClosedReason.None);
    setFormRejectedAt(app.rejectedAt || todayIsoDate());
    setFormRejectionNotes(app.rejectionNotes || "");
    setFormJd(app.jobDescription);
    setFormNotes(app.notes);
    setIsEditorOpen(true);
  };

  const modalPriorMatches = useMemo(() => {
    if (!isEditorOpen) return [];
    if (
      formCompany.trim().length < 2 &&
      formUrl.trim().length < 8
    ) {
      return [];
    }
    return findPriorJobMatches(
      {
        company: formCompany,
        role: formRole,
        jobUrl: formUrl,
        jobDescription: formJd,
        excludeId: editingApp?.id,
      },
      applications
    );
  }, [
    isEditorOpen,
    formCompany,
    formRole,
    formUrl,
    formJd,
    editingApp?.id,
    applications,
  ]);

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCompany.trim() || !formRole.trim()) return;

    const nowIso = new Date().toISOString();
    const id = editingApp ? editingApp.id : `app_${Date.now()}`;
    const isRejectedSave =
      formStage === ApplicationStage.Closed &&
      formStageReason === ClosedReason.Rejected;
    const record: ApplicationRecord = {
      id,
      company: sanitizeDashes(formCompany.trim()),
      role: sanitizeDashes(formRole.trim()),
      contactName: sanitizeDashes(formContactName.trim()),
      contactEmail: sanitizeDashes(formContactEmail.trim()),
      source: sanitizeDashes(formSource.trim()),
      jobUrl: formUrl.trim(),
      stage: formStage,
      stageReason:
        formStage === ApplicationStage.Closed ? formStageReason : ClosedReason.None,
      rejectedAt: isRejectedSave
        ? formRejectedAt || editingApp?.rejectedAt || todayIsoDate()
        : undefined,
      rejectionStage: isRejectedSave
        ? editingApp && editingApp.stage !== ApplicationStage.Closed
          ? editingApp.stage
          : editingApp?.rejectionStage || ApplicationStage.Applied
        : undefined,
      rejectionNotes: isRejectedSave
        ? sanitizeDashes(formRejectionNotes.trim())
        : undefined,
      jobDescription: sanitizeDashes(formJd.trim()),
      notes: sanitizeDashes(formNotes.trim()),
      createdAt: editingApp ? editingApp.createdAt : todayIsoDate(),
      updatedAt: nowIso,
    };

    let initialEvent: TimelineEvent | undefined;
    if (!editingApp) {
      initialEvent = {
        id: `evt_${Date.now()}`,
        applicationId: id,
        date: todayIsoDate(),
        type:
          formStage === ApplicationStage.Saved ||
          formStage === ApplicationStage.Closed
            ? TimelineEventType.Note
            : TimelineEventType.Applied,
        notes: isRejectedSave
          ? "Logged role as Rejected"
          : formStage === ApplicationStage.Saved
          ? "Saved role to pipeline"
          : `Submitted application (${formStage})`,
        sequence: Date.now(),
      };
    }

    onSaveApplication(record, initialEvent);
    setIsEditorOpen(false);
  };

  const rejectedTotalCount = useMemo(
    () => applications.filter((a) => isApplicationRejected(a)).length,
    [applications]
  );

  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      const matchesStage =
        stageFilter === "ALL"
          ? true
          : stageFilter === "REJECTED"
          ? isApplicationRejected(app)
          : app.stage === stageFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        app.company.toLowerCase().includes(q) ||
        app.role.toLowerCase().includes(q) ||
        app.contactName.toLowerCase().includes(q);
      return matchesStage && matchesSearch;
    });
  }, [applications, stageFilter, searchQuery]);

  const selectedApp = useMemo(
    () => applications.find((a) => a.id === selectedAppId) || null,
    [applications, selectedAppId]
  );

  const selectedAppEvents = useMemo(() => {
    if (!selectedApp) return [];
    return events
      .filter((e) => e.applicationId === selectedApp.id)
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.sequence || 0) - (a.sequence || 0);
      });
  }, [events, selectedApp]);

  const selectedAppInterviews = useMemo(() => {
    if (!selectedApp) return [];
    return interviews
      .filter((i) => i.applicationId === selectedApp.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [interviews, selectedApp]);

  const handleAddTimelineEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !evtDate) return;
    onAddEvent({
      id: `evt_${Date.now()}`,
      applicationId: selectedApp.id,
      date: evtDate,
      type: evtType,
      notes: sanitizeDashes(evtNotes.trim()) || `${evtType} logged`,
      sequence: Date.now(),
    });
    setEvtNotes("");
  };

  const startEditEvent = (evt: TimelineEvent) => {
    setEditingEventId(evt.id);
    setEditEvtDate(evt.date);
    setEditEvtType(evt.type);
    setEditEvtNotes(evt.notes);
  };

  const saveEditEvent = (evt: TimelineEvent) => {
    if (!editEvtDate) return;
    onUpdateEvent?.({
      ...evt,
      date: editEvtDate,
      type: editEvtType,
      notes: sanitizeDashes(editEvtNotes.trim()) || `${editEvtType} logged`,
    });
    setEditingEventId(null);
  };

  const openNewInterviewForm = () => {
    setEditingInterviewId(null);
    setIntDate(todayIsoDate());
    setIntType(InterviewType.RecruiterScreen);
    setIntPeople("");
    setIntGrade(4);
    setIntHighlights("");
    setIntImprovements("");
    setIntQuestionsRaw("");
    setShowInterviewForm(true);
  };

  const startEditInterview = (intRec: InterviewRecord) => {
    setEditingInterviewId(intRec.id);
    setIntDate(intRec.date);
    setIntType(intRec.type);
    setIntPeople(intRec.interviewers);
    setIntGrade(intRec.selfGrade);
    setIntHighlights(intRec.highlights);
    setIntImprovements(intRec.improvements);
    setIntQuestionsRaw(
      intRec.questions.map((q) => `${q.topic}: ${q.text}`).join("\n")
    );
    setShowInterviewForm(true);
  };

  const handleSaveInterviewLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !intDate) return;
    const questions = intQuestionsRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          return {
            topic: sanitizeDashes(line.slice(0, colonIdx).trim()),
            text: sanitizeDashes(line.slice(colonIdx + 1).trim()),
          };
        }
        return { topic: "General", text: sanitizeDashes(line) };
      });

    const recordPayload: InterviewRecord = {
      id: editingInterviewId || `int_${Date.now()}`,
      applicationId: selectedApp.id,
      date: intDate,
      type: intType,
      interviewers: sanitizeDashes(intPeople.trim()),
      selfGrade: Math.min(5, Math.max(1, Number(intGrade) || 3)),
      highlights: sanitizeDashes(intHighlights.trim()),
      improvements: sanitizeDashes(intImprovements.trim()),
      questions,
    };

    if (editingInterviewId) {
      onUpdateInterview?.(recordPayload);
    } else {
      onAddInterview(recordPayload);
      onAddEvent({
        id: `evt_${Date.now() + 1}`,
        applicationId: selectedApp.id,
        date: intDate,
        type: TimelineEventType.Interview,
        notes: `${intType} debrief logged (self-grade ${intGrade}/5)`,
        sequence: Date.now() + 1,
      });
    }

    setEditingInterviewId(null);
    setIntPeople("");
    setIntHighlights("");
    setIntImprovements("");
    setIntQuestionsRaw("");
    setShowInterviewForm(false);
  };

  const mapStageToEventType = (stage: ApplicationStage): TimelineEventType => {
    if (stage === ApplicationStage.Applied) return TimelineEventType.Applied;
    if (stage === ApplicationStage.RecruiterScreen) return TimelineEventType.Contact;
    if (
      stage === ApplicationStage.TechnicalInterview ||
      stage === ApplicationStage.FinalInterview
    ) {
      return TimelineEventType.Interview;
    }
    if (stage === ApplicationStage.Offer) return TimelineEventType.Offer;
    return TimelineEventType.Note;
  };

  const handleQuickStageChange = (
    app: ApplicationRecord,
    nextStage: ApplicationStage,
    viaKanbanDrop = false
  ) => {
    if (app.stage === nextStage) return;
    const prevStage = app.stage;
    const updatedRecord: ApplicationRecord = {
      ...app,
      stage: nextStage,
      stageReason:
        nextStage === ApplicationStage.Closed
          ? app.stageReason || ClosedReason.NoResponse
          : ClosedReason.None,
      updatedAt: new Date().toISOString(),
    };

    const stageMoveEvent: TimelineEvent | undefined = viaKanbanDrop
      ? {
          id: `evt_${Date.now()}`,
          applicationId: app.id,
          date: todayIsoDate(),
          type: mapStageToEventType(nextStage),
          notes: `Moved from ${prevStage} to ${nextStage}`,
          sequence: Date.now(),
        }
      : undefined;

    onSaveApplication(updatedRecord, stageMoveEvent);
  };

  const handleMarkRejected = (app: ApplicationRecord) => {
    if (isApplicationRejected(app)) return;
    const prevStage =
      app.stage !== ApplicationStage.Closed
        ? app.stage
        : app.rejectionStage || ApplicationStage.Applied;
    const today = todayIsoDate();
    const updatedRecord: ApplicationRecord = {
      ...app,
      stage: ApplicationStage.Closed,
      stageReason: ClosedReason.Rejected,
      rejectedAt: today,
      rejectionStage: prevStage,
      updatedAt: new Date().toISOString(),
    };
    const rejectionEvent: TimelineEvent = {
      id: `evt_${Date.now()}`,
      applicationId: app.id,
      date: today,
      type: TimelineEventType.Note,
      notes: `Marked as Rejected (after ${prevStage})`,
      sequence: Date.now(),
    };
    onSaveApplication(updatedRecord, rejectionEvent);
  };

  const handleReopenRejected = (app: ApplicationRecord) => {
    const restoredStage =
      app.rejectionStage &&
      ALL_STAGES.includes(app.rejectionStage as ApplicationStage) &&
      app.rejectionStage !== ApplicationStage.Closed
        ? (app.rejectionStage as ApplicationStage)
        : ApplicationStage.Applied;
    const updatedRecord: ApplicationRecord = {
      ...app,
      stage: restoredStage,
      stageReason: ClosedReason.None,
      rejectedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    const reopenEvent: TimelineEvent = {
      id: `evt_${Date.now()}`,
      applicationId: app.id,
      date: todayIsoDate(),
      type: TimelineEventType.Note,
      notes: `Reopened role from Rejected back to ${restoredStage}`,
      sequence: Date.now(),
    };
    onSaveApplication(updatedRecord, reopenEvent);
  };

  const getPriorRejectedForActiveApp = (app: ApplicationRecord) => {
    if (isApplicationRejected(app)) return null;
    const matches = findPriorJobMatches(
      {
        company: app.company,
        role: app.role,
        jobUrl: app.jobUrl,
        jobDescription: app.jobDescription,
        excludeId: app.id,
      },
      applications
    );
    return matches.find((m) => m.isRejected) || null;
  };

  const handleDragStartCard = (
    e: React.DragEvent<HTMLElement>,
    appId: string
  ) => {
    setDraggedAppId(appId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", appId);
  };

  const handleDragEndCard = () => {
    setDraggedAppId(null);
    setDragOverStage(null);
  };

  const handleDragOverColumn = (
    e: React.DragEvent<HTMLDivElement>,
    stage: ApplicationStage
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stage) {
      setDragOverStage(stage);
    }
  };

  const handleDropOnColumn = (
    e: React.DragEvent<HTMLDivElement>,
    targetStage: ApplicationStage
  ) => {
    e.preventDefault();
    const droppedId = draggedAppId || e.dataTransfer.getData("text/plain");
    setDraggedAppId(null);
    setDragOverStage(null);
    if (!droppedId) return;
    const targetApp = applications.find((a) => a.id === droppedId);
    if (!targetApp || targetApp.stage === targetStage) return;
    handleQuickStageChange(targetApp, targetStage, true);
  };

  const handleCopyCheckIn = async () => {
    if (!checkInDraft) return;
    await navigator.clipboard.writeText(checkInDraft);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const renderFollowUpTone = (tone: "neutral" | "amber" | "crimson") => {
    if (tone === "amber") return "text-amber-700 font-medium";
    if (tone === "crimson") return "text-red-700 font-medium";
    return "text-slate-600";
  };

  return (
    <div className="space-y-6">
      {/* Workspace Action & Filter Toolbar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Applications Pipeline
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track active roles, monitor days since last contact, and draft neutral check-ins.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLoadDemo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Load sample applications, events, and interview debriefs"
          >
            <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
            Load Sample Pipeline
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Export all applications, logs, and resumes to a local .json file"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export (.json)
          </button>
          <label
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Restore workspace from an exported .json file"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            Restore (.json)
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportJson(file);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* Horizontal SVG Stage Distribution & Bottleneck Detector */}
      {(() => {
        const stagePalette: Record<
          ApplicationStage,
          { fill: string; label: string }
        > = {
          [ApplicationStage.Saved]: { fill: "#64748b", label: "Saved" },
          [ApplicationStage.Applied]: { fill: "#2563eb", label: "Applied" },
          [ApplicationStage.RecruiterScreen]: { fill: "#0284c7", label: "Screen" },
          [ApplicationStage.TechnicalInterview]: { fill: "#4f46e5", label: "Technical" },
          [ApplicationStage.FinalInterview]: { fill: "#7c3aed", label: "Final" },
          [ApplicationStage.Offer]: { fill: "#16a34a", label: "Offer" },
          [ApplicationStage.Closed]: { fill: "#cbd5e1", label: "Closed" },
        };

        const total = applications.length;
        let cursor = 0;
        const allStageMetrics = ALL_STAGES.map((st) => {
          const stageApps = applications.filter((a) => a.stage === st);
          const count = stageApps.length;
          const overdueCount = stageApps.filter((a) => {
            if (st === ApplicationStage.Saved || st === ApplicationStage.Closed) {
              return false;
            }
            return computeFollowUpStatus(a, events).daysElapsed >= 7;
          }).length;
          const widthPct = total > 0 ? (count / total) * 100 : 0;
          const xPct = cursor;
          cursor += widthPct;
          return {
            stage: st,
            count,
            overdueCount,
            xPct,
            widthPct,
            fill: stagePalette[st].fill,
            shortLabel: stagePalette[st].label,
          };
        });

        const activeSegments = allStageMetrics.filter((s) => s.count > 0);

        // Identify primary bottleneck among active non-closed, non-offer stages
        const bottleneckCandidates = allStageMetrics.filter(
          (s) =>
            s.stage !== ApplicationStage.Closed &&
            s.stage !== ApplicationStage.Offer &&
            s.count > 0
        );
        const primaryBottleneck = [...bottleneckCandidates].sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.overdueCount - a.overdueCount;
        })[0];

        let bottleneckText = "Add applications to track stage distribution and spot conversion bottlenecks.";
        if (total > 0 && primaryBottleneck) {
          const sharePct = Math.round((primaryBottleneck.count / total) * 100);
          if (primaryBottleneck.stage === ApplicationStage.Saved) {
            bottleneckText = `Bottleneck: ${primaryBottleneck.count} ${
              primaryBottleneck.count === 1 ? "role is" : "roles are"
            } sitting in Saved (${sharePct}%). Tailor and submit to move into Applied.`;
          } else if (primaryBottleneck.overdueCount > 0) {
            bottleneckText = `Bottleneck: ${primaryBottleneck.stage} holds ${primaryBottleneck.count} ${
              primaryBottleneck.count === 1 ? "role" : "roles"
            } (${sharePct}%), with ${primaryBottleneck.overdueCount} waiting 7+ days since contact.`;
          } else {
            bottleneckText = `Largest active stage: ${primaryBottleneck.stage} (${primaryBottleneck.count} of ${total} roles, ${sharePct}%).`;
          }
        }

        return (
          <section className="rounded-xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-900">
                  Stage Distribution & Bottleneck Tracker
                </span>
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums text-slate-600">
                  {total} {total === 1 ? "application" : "applications"}
                </span>
              </div>
              <div className="text-xs text-slate-600">{bottleneckText}</div>
            </div>

            {/* Proportional Horizontal SVG Bar with Embedded Stage Counts */}
            <svg
              width="100%"
              height="28"
              className="mt-3 block h-7 w-full overflow-hidden rounded-lg bg-slate-100"
              role="img"
              aria-label="Horizontal distribution bar of application counts by hiring stage"
            >
              {total === 0 ? (
                <rect x="0%" y={0} width="100%" height={28} fill="#f1f5f9" />
              ) : (
                activeSegments.map((seg, idx) => {
                  const gapPct = idx < activeSegments.length - 1 ? 0.25 : 0;
                  const segWidthPct = Math.max(seg.widthPct - gapPct, 0.5);
                  const centerPct = seg.xPct + segWidthPct / 2;
                  const isSelected = stageFilter === seg.stage;
                  const isDimmed =
                    stageFilter !== "ALL" && stageFilter !== seg.stage;
                  const textFill =
                    seg.stage === ApplicationStage.Closed
                      ? "#1e293b"
                      : "#ffffff";

                  return (
                    <g
                      key={seg.stage}
                      className={`cursor-pointer transition-opacity ${
                        isDimmed ? "opacity-35" : "opacity-100"
                      }`}
                      onClick={() =>
                        setStageFilter((prev) =>
                          prev === seg.stage ? "ALL" : seg.stage
                        )
                      }
                    >
                      <rect
                        x={`${seg.xPct}%`}
                        y={0}
                        width={`${segWidthPct}%`}
                        height={28}
                        fill={seg.fill}
                      />
                      {isSelected && (
                        <rect
                          x={`${seg.xPct}%`}
                          y={25}
                          width={`${segWidthPct}%`}
                          height={3}
                          fill="#0f172a"
                        />
                      )}
                      {seg.widthPct >= 7 && (
                        <text
                          x={`${centerPct}%`}
                          y={18}
                          textAnchor="middle"
                          fill={textFill}
                          fontSize="11"
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="600"
                        >
                          {seg.widthPct >= 15
                            ? `${seg.shortLabel}: ${seg.count}`
                            : `${seg.count}`}
                        </text>
                      )}
                      <title>{`${seg.stage}: ${seg.count} (${Math.round(
                        seg.widthPct
                      )}%)${
                        seg.overdueCount > 0
                          ? ` - ${seg.overdueCount} waiting 7+ days`
                          : ""
                      }`}</title>
                    </g>
                  );
                })
              )}
            </svg>

            {/* Full 7-Stage Count Breakdown Legend */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                {allStageMetrics.map((seg) => {
                  const isSelected = stageFilter === seg.stage;
                  const isBottleneck =
                    total > 0 &&
                    primaryBottleneck?.stage === seg.stage &&
                    seg.count > 0;
                  return (
                    <button
                      key={seg.stage}
                      type="button"
                      onClick={() =>
                        setStageFilter((prev) =>
                          prev === seg.stage ? "ALL" : seg.stage
                        )
                      }
                      className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isSelected
                          ? "font-semibold text-slate-900 underline underline-offset-4"
                          : seg.count === 0
                          ? "text-slate-400 hover:text-slate-700"
                          : "text-slate-700 hover:text-slate-900"
                      }`}
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        aria-hidden="true"
                      >
                        <rect
                          width="8"
                          height="8"
                          rx="2"
                          fill={seg.count > 0 ? seg.fill : "#e2e8f0"}
                        />
                      </svg>
                      <span>{seg.shortLabel}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {seg.count}
                      </span>
                      {isBottleneck && seg.overdueCount > 0 && (
                        <span className="font-mono text-[11px] tabular-nums text-amber-700">
                          ({seg.overdueCount} due)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {stageFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setStageFilter("ALL")}
                  className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap cursor-pointer"
                >
                  Clear filter
                </button>
              )}
            </div>
          </section>
        );
      })()}

      {/* Search + Interactive Segmented Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setStageFilter("ALL")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              stageFilter === "ALL"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All <span className="tabular-nums text-slate-400">({applications.length})</span>
          </button>
          {ALL_STAGES.map((stage) => {
            const count = applications.filter((a) => a.stage === stage).length;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => setStageFilter(stage)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  stageFilter === stage
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {stage} <span className="tabular-nums text-slate-400">({count})</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setStageFilter("REJECTED")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              stageFilter === "REJECTED"
                ? "bg-white text-red-700 shadow-xs"
                : "text-red-700/80 hover:text-red-800"
            }`}
          >
            Rejected <span className="tabular-nums">({rejectedTotalCount})</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search role, company, contact..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setLayoutMode("kanban")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layoutMode === "kanban"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("board")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layoutMode === "board"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("list")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layoutMode === "list"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {applications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            No applications logged yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
            Start with one target role to track dated events and follow-up timing, or populate realistic sample records to explore every tab immediately.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => openCreateModal(ApplicationStage.Applied)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              New Application
            </button>
            {onOpenMasterResume && (
              <button
                type="button"
                onClick={onOpenMasterResume}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileUp className="h-4 w-4 text-blue-600" />
                Upload / Build Master Resume
              </button>
            )}
            <button
              type="button"
              onClick={() => downloadResumePdf(masterResume)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileDown className="h-4 w-4 text-slate-600" />
              Download Resume (.pdf)
            </button>
            <button
              type="button"
              onClick={onLoadDemo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Load Demo Data
            </button>
          </div>
        </div>
      ) : layoutMode === "kanban" ? (
        /* Interactive Drag-and-Drop Kanban Board */
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Drag any role card across stage columns to advance its hiring stage and log a dated timeline update automatically.
            </span>
            {stageFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => setStageFilter("ALL")}
                className="font-medium text-blue-600 hover:underline whitespace-nowrap cursor-pointer"
              >
                Show all 7 columns
              </button>
            )}
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 pt-1">
            {(stageFilter === "ALL"
              ? ALL_STAGES
              : stageFilter === "REJECTED"
              ? [ApplicationStage.Closed]
              : ALL_STAGES.filter((st) => st === stageFilter)
            ).map((stage) => {
              const q = searchQuery.trim().toLowerCase();
              const columnApps = applications.filter((app) => {
                if (stageFilter === "REJECTED") {
                  if (!isApplicationRejected(app)) return false;
                } else if (app.stage !== stage) {
                  return false;
                }
                if (!q) return true;
                return (
                  app.company.toLowerCase().includes(q) ||
                  app.role.toLowerCase().includes(q) ||
                  app.contactName.toLowerCase().includes(q)
                );
              });
              const isDropTarget = dragOverStage === stage;

              return (
                <div
                  key={stage}
                  onDragOver={(e) => handleDragOverColumn(e, stage)}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverStage((prev) => (prev === stage ? null : prev));
                    }
                  }}
                  onDrop={(e) => handleDropOnColumn(e, stage)}
                  className={`flex min-h-[440px] w-72 shrink-0 flex-col rounded-xl border p-3 transition-colors ${
                    isDropTarget
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-slate-200 bg-slate-100/70"
                  }`}
                >
                  {/* Column Header */}
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="truncate text-xs font-semibold text-slate-900">
                        {stageFilter === "REJECTED" ? "Closed · Rejected" : stage}
                      </h3>
                      <span className="font-mono text-xs tabular-nums text-slate-500">
                        {columnApps.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCreateModal(stage)}
                      title={`Add application in ${stage}`}
                      className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                      aria-label={`Add application in ${stage}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Draggable Role Cards */}
                  <div className="flex flex-1 flex-col gap-2.5">
                    {columnApps.length === 0 ? (
                      <div
                        className={`flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-8 text-center text-xs transition-colors ${
                          isDropTarget
                            ? "border-blue-400 bg-white/80 font-medium text-blue-700"
                            : "border-slate-200/90 text-slate-400"
                        }`}
                      >
                        {isDropTarget ? `Drop to move to ${stage}` : "Drop role here"}
                      </div>
                    ) : (
                      columnApps.map((app) => {
                        const status = computeFollowUpStatus(app, events);
                        const isDragging = draggedAppId === app.id;
                        const rejected = isApplicationRejected(app);
                        const priorRej = getPriorRejectedForActiveApp(app);
                        return (
                          <article
                            key={app.id}
                            draggable
                            onDragStart={(e) => handleDragStartCard(e, app.id)}
                            onDragEnd={handleDragEndCard}
                            onClick={() => {
                              setSelectedAppId(app.id);
                              setCheckInDraft(null);
                            }}
                            className={`rounded-lg border bg-white p-3.5 transition-opacity transition-transform cursor-grab active:cursor-grabbing ${
                              isDragging
                                ? "border-blue-400 opacity-45"
                                : rejected
                                ? "border-red-200 hover:border-red-300"
                                : "border-slate-200 hover:border-slate-400"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="text-sm font-semibold leading-snug text-slate-900">
                                  {app.role}
                                </h4>
                                <div className="mt-0.5 truncate text-xs text-slate-600">
                                  {app.company}
                                  {app.contactName ? ` · ${app.contactName}` : ""}
                                </div>
                              </div>
                              <GripVertical
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300"
                                aria-hidden="true"
                              />
                            </div>

                            {priorRej && (
                              <div className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-red-700">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>
                                  Flagged: Previously rejected
                                  {priorRej.app.rejectedAt
                                    ? ` (${priorRej.app.rejectedAt})`
                                    : ""}
                                </span>
                              </div>
                            )}

                            {app.stage !== ApplicationStage.Saved &&
                              app.stage !== ApplicationStage.Closed && (
                                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                                  <span className="font-mono tabular-nums">
                                    {status.daysElapsed}d elapsed
                                  </span>
                                </div>
                              )}

                            <div
                              className={`mt-2 flex items-start gap-1.5 border-t border-slate-100 pt-2 text-[11px] leading-snug ${renderFollowUpTone(
                                status.tone
                              )}`}
                            >
                              {rejected ? (
                                <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                              ) : (
                                <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                              )}
                              <span>{status.label}</span>
                            </div>

                            <div
                              className="mt-2.5 flex items-center justify-between gap-2 pt-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-2.5">
                                {!rejected && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedAppId(app.id);
                                      setCheckInDraft(
                                        generateCheckInDraft(app, candidateName)
                                      );
                                    }}
                                    className="text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                                  >
                                    Check-in
                                  </button>
                                )}
                                {!rejected ? (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkRejected(app)}
                                    className="text-[11px] font-medium text-red-700 hover:text-red-900 cursor-pointer"
                                    title="Mark application as Rejected and flag if reposted"
                                  >
                                    Reject
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleReopenRejected(app)}
                                    className="text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                                  >
                                    Reopen
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => onOpenMatchStudio(app.id)}
                                className="text-[11px] font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                              >
                                Tailor
                              </button>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : layoutMode === "list" ? (
        /* High-Density Table View */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">Role & Company</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3 text-right">Days Elapsed</th>
                <th className="px-4 py-3">Follow-Up Guidance</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredApps.map((app) => {
                const status = computeFollowUpStatus(app, events);
                const rejected = isApplicationRejected(app);
                const priorRej = getPriorRejectedForActiveApp(app);
                return (
                  <tr
                    key={app.id}
                    onClick={() => {
                      setSelectedAppId(app.id);
                      setCheckInDraft(null);
                    }}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{app.role}</div>
                      <div className="text-xs text-slate-500">{app.company}</div>
                      {priorRej && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-red-700">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>
                            Repeat of rejected role
                            {priorRej.app.rejectedAt
                              ? ` (${priorRej.app.rejectedAt})`
                              : ""}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {rejected ? (
                        <span className="font-medium text-red-700">
                          Closed · Rejected
                        </span>
                      ) : (
                        <span className="text-slate-700">{app.stage}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {app.contactName || "Unlisted"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                      {app.stage === ApplicationStage.Saved || app.stage === ApplicationStage.Closed
                        ? "-"
                        : `${status.daysElapsed}d`}
                    </td>
                    <td className={`px-4 py-3 text-xs ${renderFollowUpTone(status.tone)}`}>
                      {status.label}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-3">
                        {!rejected ? (
                          <button
                            type="button"
                            onClick={() => handleMarkRejected(app)}
                            className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap cursor-pointer"
                          >
                            Mark Rejected
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReopenRejected(app)}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap cursor-pointer"
                          >
                            Reopen
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenMatchStudio(app.id)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap cursor-pointer"
                        >
                          Tailor Resume
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Categorized Stage Cards Grid */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredApps.map((app) => {
            const status = computeFollowUpStatus(app, events);
            const rejected = isApplicationRejected(app);
            const priorRej = getPriorRejectedForActiveApp(app);
            return (
              <article
                key={app.id}
                onClick={() => {
                  setSelectedAppId(app.id);
                  setCheckInDraft(null);
                }}
                className={`flex flex-col justify-between rounded-xl border bg-white p-5 transition-colors cursor-pointer ${
                  rejected
                    ? "border-red-200 hover:border-red-300"
                    : "border-slate-200 hover:border-slate-400"
                }`}
              >
                <div>
                  {/* Quiet 1-line metadata kicker (zero pill enclosures) */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span
                      className={`font-medium ${
                        rejected ? "text-red-700" : "text-slate-700"
                      }`}
                    >
                      {rejected ? "Closed · Rejected" : app.stage}
                    </span>
                    {app.stage !== ApplicationStage.Saved &&
                      app.stage !== ApplicationStage.Closed && (
                        <span className="font-mono tabular-nums">
                          {status.daysElapsed}d since contact
                        </span>
                      )}
                  </div>

                  <h3 className="mt-2 text-base font-semibold text-slate-900">
                    {app.role}
                  </h3>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                    <span>{app.company}</span>
                    {app.contactName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-xs text-slate-500">{app.contactName}</span>
                      </>
                    )}
                  </div>

                  {priorRej && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Flagged: Matches previously rejected role
                        {priorRej.app.rejectedAt
                          ? ` (${priorRej.app.rejectedAt})`
                          : ""}
                      </span>
                    </div>
                  )}

                  {(rejected && app.rejectionNotes) || app.notes ? (
                    <p className="mt-3 line-clamp-2 text-xs text-slate-500">
                      {rejected && app.rejectionNotes ? app.rejectionNotes : app.notes}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className={`flex items-start gap-1.5 text-xs ${renderFollowUpTone(status.tone)}`}>
                    {rejected ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{status.label}</span>
                  </div>

                  <div
                    className="mt-3 flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-3">
                      {!rejected && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAppId(app.id);
                            setCheckInDraft(generateCheckInDraft(app, candidateName));
                          }}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Draft check-in
                        </button>
                      )}
                      {!rejected ? (
                        <button
                          type="button"
                          onClick={() => handleMarkRejected(app)}
                          className="text-xs font-medium text-red-700 hover:text-red-900 cursor-pointer"
                        >
                          Mark Rejected
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReopenRejected(app)}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Reopen Role
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenMatchStudio(app.id)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Match & Tailor
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Detail Slide-Over Drawer */}
      {selectedApp && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/35"
          onClick={() => setSelectedAppId(null)}
        >
          <div
            className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{selectedApp.company}</span>
                  {selectedApp.source && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{selectedApp.source}</span>
                    </>
                  )}
                  {selectedApp.jobUrl && (
                    <>
                      <span aria-hidden="true">·</span>
                      <a
                        href={selectedApp.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        Posting <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  {selectedApp.role}
                </h2>
                <div className="mt-1 text-xs text-slate-500">
                  Contact: {selectedApp.contactName || "None listed"}
                  {selectedApp.contactEmail ? ` (${selectedApp.contactEmail})` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppId(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                aria-label="Close details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Repeat / Previously Rejected Flag inside Drawer if Active Duplicate */}
            {(() => {
              const priorRej = getPriorRejectedForActiveApp(selectedApp);
              if (!priorRej) return null;
              return (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-semibold text-red-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        Flagged Repeat Posting · Previously Rejected at{" "}
                        {priorRej.app.company}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAppId(priorRej.app.id)}
                      className="font-medium text-red-800 underline hover:text-red-950 cursor-pointer"
                    >
                      View Prior Record
                    </button>
                  </div>
                  <p className="mt-1 text-red-900">
                    Matched <strong>{priorRej.app.role}</strong> ({priorRej.reasonLabel.toLowerCase()})
                    {priorRej.app.rejectedAt ? ` · Rejected on ${priorRej.app.rejectedAt}` : ""}
                    {priorRej.app.rejectionStage
                      ? ` after ${priorRej.app.rejectionStage}`
                      : ""}
                    .
                  </p>
                  {(priorRej.app.rejectionNotes || priorRej.app.notes) && (
                    <p className="mt-1 text-red-800">
                      Prior note: {priorRej.app.rejectionNotes || priorRej.app.notes}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Stage & Follow-Up Guidance */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Current Stage
                </label>
                <select
                  value={selectedApp.stage}
                  onChange={(e) =>
                    handleQuickStageChange(
                      selectedApp,
                      e.target.value as ApplicationStage
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {ALL_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                {selectedApp.stage === ApplicationStage.Closed && (
                  <select
                    value={selectedApp.stageReason || ClosedReason.NoResponse}
                    onChange={(e) => {
                      const nextReason = e.target.value as ClosedReason;
                      onSaveApplication({
                        ...selectedApp,
                        stageReason: nextReason,
                        rejectedAt:
                          nextReason === ClosedReason.Rejected
                            ? selectedApp.rejectedAt || todayIsoDate()
                            : undefined,
                        rejectionStage:
                          nextReason === ClosedReason.Rejected
                            ? selectedApp.rejectionStage || ApplicationStage.Applied
                            : undefined,
                        updatedAt: new Date().toISOString(),
                      });
                    }}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                  >
                    <option value={ClosedReason.Rejected}>Reason: rejected</option>
                    <option value={ClosedReason.NoResponse}>Reason: no response</option>
                    <option value={ClosedReason.Declined}>Reason: declined</option>
                    <option value={ClosedReason.HiredElsewhere}>Reason: hired elsewhere</option>
                  </select>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                {(() => {
                  const st = computeFollowUpStatus(selectedApp, events);
                  return (
                    <>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Follow-up status</span>
                        <span className="font-mono tabular-nums">{st.daysElapsed}d elapsed</span>
                      </div>
                      <p className={`mt-1 text-sm ${renderFollowUpTone(st.tone)}`}>
                        {st.label}
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Editable Rejection Record Panel when Rejected */}
            {isApplicationRejected(selectedApp) && (
              <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Rejected Role Record · Automatically flags future reposts in Job Boards, Pipeline & Tailoring
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReopenRejected(selectedApp)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reopen Role
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Rejected Date
                    </label>
                    <input
                      type="date"
                      value={selectedApp.rejectedAt || todayIsoDate()}
                      onChange={(e) =>
                        onSaveApplication({
                          ...selectedApp,
                          rejectedAt: e.target.value,
                          updatedAt: new Date().toISOString(),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Stage Reached Before Rejection
                    </label>
                    <select
                      value={selectedApp.rejectionStage || ApplicationStage.Applied}
                      onChange={(e) =>
                        onSaveApplication({
                          ...selectedApp,
                          rejectionStage: e.target.value,
                          updatedAt: new Date().toISOString(),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      {ALL_STAGES.filter((s) => s !== ApplicationStage.Closed).map(
                        (st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Rejection Feedback / Note (shown if job comes up again)
                  </label>
                  <input
                    type="text"
                    value={selectedApp.rejectionNotes || ""}
                    onChange={(e) =>
                      onSaveApplication({
                        ...selectedApp,
                        rejectionNotes: sanitizeDashes(e.target.value),
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    placeholder="e.g. Auto-rejected on screen, or passed after technical round..."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Action bar inside drawer */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-5">
              <button
                type="button"
                onClick={() =>
                  downloadResumePdf(masterResume, {
                    targetApp: selectedApp,
                    workspace: tailoredByApp?.[selectedApp.id] || null,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5" />
                {tailoredByApp?.[selectedApp.id]
                  ? "Download Tailored Resume (.pdf)"
                  : "Download Resume (.pdf)"}
              </button>
              {!isApplicationRejected(selectedApp) && (
                <button
                  type="button"
                  onClick={() => handleMarkRejected(selectedApp)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Mark Rejected
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setCheckInDraft(generateCheckInDraft(selectedApp, candidateName))
                }
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Draft check-in
              </button>
              <button
                type="button"
                onClick={() => {
                  if (showInterviewForm) {
                    setShowInterviewForm(false);
                    setEditingInterviewId(null);
                  } else {
                    openNewInterviewForm();
                  }
                }}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {showInterviewForm ? "Hide Interview Form" : "Log Interview"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = selectedApp.id;
                  setSelectedAppId(null);
                  onOpenMatchStudio(id);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-blue-600 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Match & Tailor Studio
              </button>
              <button
                type="button"
                onClick={() => openEditModal(selectedApp)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Edit Details
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteApplication(selectedApp.id);
                  setSelectedAppId(null);
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>

            {/* Check-in Draft Box */}
            {checkInDraft !== null && (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Polite Check-In Message
                    </h3>
                    <p className="text-xs text-slate-500">
                      Neutral tone: zero mention of days elapsed, zero impatience.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCheckIn}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                  >
                    {copiedDraft ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Message
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={checkInDraft}
                  onChange={(e) => setCheckInDraft(sanitizeDashes(e.target.value))}
                  rows={6}
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-800 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            {/* Log / Edit Interview Form */}
            {showInterviewForm && (
              <form
                onSubmit={handleSaveInterviewLog}
                className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  {editingInterviewId ? "Edit Interview Debrief" : "Log Interview Debrief"}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Date</label>
                    <input
                      type="date"
                      value={intDate}
                      onChange={(e) => setIntDate(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Round Type</label>
                    <select
                      value={intType}
                      onChange={(e) => setIntType(e.target.value as InterviewType)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      {Object.values(InterviewType).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Self-Grade (1 to 5)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={intGrade}
                      onChange={(e) => setIntGrade(Number(e.target.value))}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Interviewers
                  </label>
                  <input
                    type="text"
                    value={intPeople}
                    onChange={(e) => setIntPeople(e.target.value)}
                    placeholder="e.g. Priya Nair, Principal Engineer"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Highlights (What landed well)
                    </label>
                    <textarea
                      value={intHighlights}
                      onChange={(e) => setIntHighlights(e.target.value)}
                      rows={2}
                      placeholder="Clear explanation of PostgreSQL indexing..."
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Areas to Improve
                    </label>
                    <textarea
                      value={intImprovements}
                      onChange={(e) => setIntImprovements(e.target.value)}
                      rows={2}
                      placeholder="Review Airflow backfill retries..."
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Questions & Topic Tags (one per line as Topic: Question)
                  </label>
                  <textarea
                    value={intQuestionsRaw}
                    onChange={(e) => setIntQuestionsRaw(e.target.value)}
                    rows={3}
                    placeholder={"System Design: How do you guarantee idempotent writes?\nSQL: Walk through diagnosing slow queries."}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInterviewForm(false);
                      setEditingInterviewId(null);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                  >
                    {editingInterviewId ? "Update Debrief" : "Save Debrief"}
                  </button>
                </div>
              </form>
            )}

            {/* Dated Event Timeline */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900">
                Dated Event Timeline
              </h3>
              <form
                onSubmit={handleAddTimelineEvent}
                className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12"
              >
                <input
                  type="date"
                  value={evtDate}
                  onChange={(e) => setEvtDate(e.target.value)}
                  required
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums sm:col-span-3"
                />
                <select
                  value={evtType}
                  onChange={(e) => setEvtType(e.target.value as TimelineEventType)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:col-span-3"
                >
                  {Object.values(TimelineEventType).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={evtNotes}
                  onChange={(e) => setEvtNotes(e.target.value)}
                  placeholder="Event note (e.g. Recruiter replied)"
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:col-span-4"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 sm:col-span-2 cursor-pointer"
                >
                  Log Event
                </button>
              </form>

              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-200">
                {selectedAppEvents.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500">
                    No events recorded yet. Add your application or outreach date above.
                  </p>
                ) : (
                  selectedAppEvents.map((evt) =>
                    editingEventId === evt.id ? (
                      <div key={evt.id} className="space-y-2 py-3 text-xs">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                          <input
                            type="date"
                            value={editEvtDate}
                            onChange={(e) => setEditEvtDate(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums sm:col-span-3"
                          />
                          <select
                            value={editEvtType}
                            onChange={(e) =>
                              setEditEvtType(e.target.value as TimelineEventType)
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:col-span-3"
                          >
                            {Object.values(TimelineEventType).map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editEvtNotes}
                            onChange={(e) => setEditEvtNotes(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:col-span-6"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingEventId(null)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEditEvent(evt)}
                            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                          >
                            Save Event
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={evt.id}
                        className="flex items-start justify-between gap-4 py-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-slate-500">
                            <span className="font-mono tabular-nums text-slate-700">
                              {evt.date}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-slate-800">{evt.type}</span>
                          </div>
                          <p className="mt-0.5 text-slate-600">{evt.notes}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {onUpdateEvent && (
                            <button
                              type="button"
                              onClick={() => startEditEvent(evt)}
                              className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600 cursor-pointer"
                              aria-label="Edit event"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteEvent(evt.id)}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label="Remove event"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </div>

            {/* Logged Interviews Summary */}
            {selectedAppInterviews.length > 0 && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Interview Debriefs ({selectedAppInterviews.length})
                </h3>
                <div className="mt-3 space-y-3">
                  {selectedAppInterviews.map((intRec) => (
                    <div
                      key={intRec.id}
                      className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                        <span>
                          <strong className="text-slate-900">{intRec.type}</strong> ·{" "}
                          <span className="font-mono tabular-nums">{intRec.date}</span>
                          {intRec.interviewers ? ` · ${intRec.interviewers}` : ""}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold tabular-nums text-slate-900">
                            Self-grade: {intRec.selfGrade}/5
                          </span>
                          {onUpdateInterview && (
                            <button
                              type="button"
                              onClick={() => startEditInterview(intRec)}
                              className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          )}
                          {onDeleteInterview && (
                            <button
                              type="button"
                              onClick={() => onDeleteInterview(intRec.id)}
                              className="text-slate-400 hover:text-red-600 cursor-pointer"
                              aria-label="Delete interview debrief"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {intRec.highlights && (
                        <p className="mt-2 text-slate-700">
                          <span className="font-medium text-emerald-800">Highlights:</span>{" "}
                          {intRec.highlights}
                        </p>
                      )}
                      {intRec.improvements && (
                        <p className="mt-1 text-slate-700">
                          <span className="font-medium text-amber-800">To improve:</span>{" "}
                          {intRec.improvements}
                        </p>
                      )}
                      {intRec.questions.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-slate-600">
                          {intRec.questions.map((q, idx) => (
                            <div key={idx}>
                              <span className="font-medium text-slate-800">{q.topic}:</span>{" "}
                              {q.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New / Edit Application Modal */}
      {isEditorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setIsEditorOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingApp ? "Edit Application" : "New Application"}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="mt-4 space-y-4">
              {/* Live Repeat / Previously Rejected Job Flag inside Create/Edit Modal */}
              {modalPriorMatches.length > 0 && (() => {
                const topMatch = modalPriorMatches[0];
                const isRej = topMatch.isRejected;
                return (
                  <div
                    className={`rounded-lg border p-3.5 text-xs ${
                      isRej
                        ? "border-red-200 bg-red-50/80 text-red-950"
                        : "border-amber-200 bg-amber-50/80 text-amber-950"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                          {isRej
                            ? "Flagged Repeat Job · Previously Rejected"
                            : "Duplicate / Prior Application Found"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditorOpen(false);
                          setSelectedAppId(topMatch.app.id);
                        }}
                        className="font-medium underline cursor-pointer"
                      >
                        Open Prior Record
                      </button>
                    </div>
                    <p className="mt-1 leading-relaxed">
                      Matches <strong>{topMatch.app.role}</strong> at{" "}
                      <strong>{topMatch.app.company}</strong> ({topMatch.reasonLabel.toLowerCase()})
                      {isRej ? (
                        <>
                          {" "}· Rejected
                          {topMatch.app.rejectedAt
                            ? ` on ${topMatch.app.rejectedAt}`
                            : ""}
                          {topMatch.app.rejectionStage
                            ? ` after ${topMatch.app.rejectionStage}`
                            : ""}
                        </>
                      ) : (
                        <> · Current stage: {topMatch.app.stage}</>
                      )}
                      .
                    </p>
                    {(topMatch.app.rejectionNotes || topMatch.app.notes) && (
                      <p className="mt-1 opacity-90">
                        Prior note: {topMatch.app.rejectionNotes || topMatch.app.notes}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Company *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="Acme Systems"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Role Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    placeholder="Backend Software Engineer"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Stage
                  </label>
                  <select
                    value={formStage}
                    onChange={(e) => {
                      const nextStage = e.target.value as ApplicationStage;
                      setFormStage(nextStage);
                      if (
                        nextStage === ApplicationStage.Closed &&
                        formStageReason === ClosedReason.None
                      ) {
                        setFormStageReason(ClosedReason.Rejected);
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    {ALL_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Source
                  </label>
                  <input
                    type="text"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    placeholder="Handshake, Referral, Direct"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {formStage === ApplicationStage.Closed && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Closed Reason
                      </label>
                      <select
                        value={formStageReason}
                        onChange={(e) =>
                          setFormStageReason(e.target.value as ClosedReason)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                      >
                        <option value={ClosedReason.Rejected}>rejected</option>
                        <option value={ClosedReason.NoResponse}>no response</option>
                        <option value={ClosedReason.Declined}>declined</option>
                        <option value={ClosedReason.HiredElsewhere}>
                          hired elsewhere
                        </option>
                      </select>
                    </div>
                    {formStageReason === ClosedReason.Rejected && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Rejected Date
                        </label>
                        <input
                          type="date"
                          value={formRejectedAt}
                          onChange={(e) => setFormRejectedAt(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
                        />
                      </div>
                    )}
                  </div>
                  {formStageReason === ClosedReason.Rejected && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Rejection Feedback / Note (shown if job comes up again)
                      </label>
                      <input
                        type="text"
                        value={formRejectionNotes}
                        onChange={(e) => setFormRejectionNotes(e.target.value)}
                        placeholder="e.g. Rejected after technical screen..."
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={formContactName}
                    onChange={(e) => setFormContactName(e.target.value)}
                    placeholder="Sarah Jenkins"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={formContactEmail}
                    onChange={(e) => setFormContactEmail(e.target.value)}
                    placeholder="recruiter@company.com"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Job Posting URL
                </label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Job Description (optional, used in Match & Tailor Studio)
                </label>
                <textarea
                  value={formJd}
                  onChange={(e) => setFormJd(e.target.value)}
                  rows={3}
                  placeholder="Paste job requirements..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Referral context, team priorities..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  Save Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
