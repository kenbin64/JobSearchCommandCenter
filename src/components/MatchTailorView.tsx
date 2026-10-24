import React, { useEffect, useMemo, useState } from "react";
import {
  ApplicationRecord,
  ApplicationStage,
  ClosedReason,
  MasterResume,
  SkillWeight,
  TailoredBulletProposal,
  TailoredWorkspace,
} from "../types";
import {
  SKILL_WEIGHT_RUBRIC,
  auditBulletHonesty,
  buildApplicantCoverLetterOutline,
  buildFourPillarCoverLetter,
  buildLocalTailoredWorkspace,
  clampSkillWeight,
  collectAllProfileUrls,
  computeWeightedSkillMatchScore,
  countWords,
  detectBannedPhrases,
  detectLongDashes,
  evaluateJobSkillRequirement,
  findPriorJobMatches,
  findUnconfirmedSkillsInText,
  formatExperienceComplianceTag,
  getMatchVerdict,
  getSkillNote,
  getSkillWeight,
  isApplicationRejected,
  normalizeSkillKey,
  partitionAndSortSkillsByWeight,
  sanitizeDashes,
  scrubAiTropesAndDashes,
  todayIsoDate,
  TOPSTEP_JOB_DESCRIPTION,
  HANDSHAKE_AI_JOB_DESCRIPTION,
} from "../engine";
import { downloadCoverLetterPdf, downloadResumePdf } from "../pdfGenerator";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileDown,
  FileEdit,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";

interface MatchTailorViewProps {
  applications: ApplicationRecord[];
  masterResume: MasterResume;
  onUpdateMasterResume?: (updated: MasterResume) => void;
  selectedAppId: string;
  onSelectAppId: (id: string) => void;
  tailoredByApp: Record<string, TailoredWorkspace>;
  onSaveWorkspace: (appId: string, workspace: TailoredWorkspace) => void;
  onUpdateJobDescription: (appId: string, jd: string) => void;
  onUpdateApplication?: (app: ApplicationRecord) => void;
  onCreateQuickApplication?: (
    company: string,
    role: string,
    jobDescription: string
  ) => void;
  onNavigateResume?: () => void;
}

export const MatchTailorView: React.FC<MatchTailorViewProps> = ({
  applications,
  masterResume,
  onUpdateMasterResume,
  selectedAppId,
  onSelectAppId,
  tailoredByApp,
  onSaveWorkspace,
  onUpdateJobDescription,
  onUpdateApplication,
  onCreateQuickApplication,
  onNavigateResume,
}) => {
  const activeApp = useMemo(
    () =>
      applications.find((a) => a.id === selectedAppId) ||
      applications[0] ||
      null,
    [applications, selectedAppId]
  );

  type TailorWorkspaceTab = "resume" | "coverletter" | "audit";
  const [workspaceTab, setWorkspaceTab] =
    useState<TailorWorkspaceTab>("resume");
  const [isJdExpanded, setIsJdExpanded] = useState<boolean>(
    !activeApp?.jobDescription?.trim()
  );

  const [jdDraft, setJdDraft] = useState<string>(
    activeApp?.jobDescription || ""
  );
  const [readerTab, setReaderTab] = useState<
    "recruiter" | "manager" | "screening"
  >("recruiter");
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
  const [aiStatusNotice, setAiStatusNotice] = useState<string>("");
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [orgFitNote, setOrgFitNote] = useState<string>("");

  // Quick Target Job inline creator state
  const [showQuickJobForm, setShowQuickJobForm] = useState(false);
  const [quickCompany, setQuickCompany] = useState("");
  const [quickRole, setQuickRole] = useState("");
  const [quickJd, setQuickJd] = useState("");

  // Unlisted Skill Confirm & 1-5 Weight state
  const [pendingWeightBySkill, setPendingWeightBySkill] = useState<
    Record<string, SkillWeight>
  >({});
  const [pendingNoteBySkill, setPendingNoteBySkill] = useState<
    Record<string, string>
  >({});
  const [customConfirmSkill, setCustomConfirmSkill] = useState("");
  const [customConfirmWeight, setCustomConfirmWeight] =
    useState<SkillWeight>(3);
  const [customConfirmNote, setCustomConfirmNote] = useState("");

  useEffect(() => {
    if (activeApp && activeApp.id !== selectedAppId) {
      onSelectAppId(activeApp.id);
    }
    const currentJd = activeApp?.jobDescription || "";
    setJdDraft(currentJd);
    if (!currentJd.trim()) {
      setIsJdExpanded(true);
    }
  }, [activeApp, selectedAppId, onSelectAppId]);

  const workspace: TailoredWorkspace | null = useMemo(() => {
    if (!activeApp) return null;
    if (tailoredByApp[activeApp.id]) {
      return tailoredByApp[activeApp.id];
    }
    return buildLocalTailoredWorkspace(activeApp, masterResume, []);
  }, [activeApp, tailoredByApp, masterResume]);

  const ensurePersistedWorkspace = (): TailoredWorkspace | null => {
    if (!activeApp) return null;
    if (tailoredByApp[activeApp.id]) return tailoredByApp[activeApp.id];
    const initial = buildLocalTailoredWorkspace(activeApp, masterResume, []);
    onSaveWorkspace(activeApp.id, initial);
    return initial;
  };

  const handleQuickJobSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateQuickApplication) return;
    if (!quickCompany.trim() || !quickRole.trim()) return;
    onCreateQuickApplication(
      sanitizeDashes(quickCompany.trim()),
      sanitizeDashes(quickRole.trim()),
      sanitizeDashes(quickJd.trim())
    );
    setQuickCompany("");
    setQuickRole("");
    setQuickJd("");
    setShowQuickJobForm(false);
  };

  const quickJobPriorMatches = useMemo(() => {
    if (quickCompany.trim().length < 2) return [];
    return findPriorJobMatches(
      {
        company: quickCompany,
        role: quickRole,
        jobDescription: quickJd,
      },
      applications
    );
  }, [quickCompany, quickRole, quickJd, applications]);

  const activePriorRejectedMatch = useMemo(() => {
    if (!activeApp || isApplicationRejected(activeApp)) return null;
    const matches = findPriorJobMatches(
      {
        company: activeApp.company,
        role: activeApp.role,
        jobUrl: activeApp.jobUrl,
        jobDescription: jdDraft.trim() || activeApp.jobDescription,
        excludeId: activeApp.id,
      },
      applications
    );
    return matches.find((m) => m.isRejected) || null;
  }, [activeApp, jdDraft, applications]);

  const handleUpdateActiveAppMeta = (patch: Partial<ApplicationRecord>) => {
    if (!activeApp || !onUpdateApplication) return;
    onUpdateApplication({
      ...activeApp,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleToggleActiveRejected = () => {
    if (!activeApp || !onUpdateApplication) return;
    if (isApplicationRejected(activeApp)) {
      const restoredStage =
        activeApp.rejectionStage &&
        activeApp.rejectionStage !== ApplicationStage.Closed
          ? (activeApp.rejectionStage as ApplicationStage)
          : ApplicationStage.Applied;
      onUpdateApplication({
        ...activeApp,
        stage: restoredStage,
        stageReason: ClosedReason.None,
        rejectedAt: undefined,
        updatedAt: new Date().toISOString(),
      });
    } else {
      onUpdateApplication({
        ...activeApp,
        stage: ApplicationStage.Closed,
        stageReason: ClosedReason.Rejected,
        rejectedAt: todayIsoDate(),
        rejectionStage:
          activeApp.stage !== ApplicationStage.Closed
            ? activeApp.stage
            : activeApp.rejectionStage || ApplicationStage.Applied,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleRunLocalAnalysis = () => {
    if (!activeApp) return;
    const cleanJd = sanitizeDashes(jdDraft.trim());
    onUpdateJobDescription(activeApp.id, cleanJd);
    const updatedApp = { ...activeApp, jobDescription: cleanJd };
    const existingConfirmed = workspace?.confirmedSkills || [];
    const built = buildLocalTailoredWorkspace(
      updatedApp,
      masterResume,
      existingConfirmed
    );
    const merged: TailoredWorkspace = {
      ...built,
      tailoredHeadline: workspace?.tailoredHeadline,
      tailoredSummary: workspace?.tailoredSummary,
    };
    setAiStatusNotice(
      "Evaluated locally in browser (zero external requests)."
    );
    onSaveWorkspace(activeApp.id, merged);
  };

  const handleRunGeminiTailor = async () => {
    if (!activeApp) return;
    const cleanJd = sanitizeDashes(jdDraft.trim());
    if (!cleanJd) {
      setAiStatusNotice("Paste a job description first.");
      return;
    }

    onUpdateJobDescription(activeApp.id, cleanJd);
    setIsAiRunning(true);
    setAiStatusNotice(
      "Privacy Notice: Sending Master Resume and Job Description to Gemini 3.8 Flash for grounded tailoring..."
    );

    const existingConfirmed = workspace?.confirmedSkills || [];

    try {
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterResume,
          jobDescription: cleanJd,
          role: activeApp.role,
          company: activeApp.company,
          confirmedSkills: existingConfirmed,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const fallback = buildLocalTailoredWorkspace(
          { ...activeApp, jobDescription: cleanJd },
          masterResume,
          existingConfirmed
        );
        onSaveWorkspace(activeApp.id, {
          ...fallback,
          tailoredHeadline: workspace?.tailoredHeadline,
          tailoredSummary: workspace?.tailoredSummary,
        });
        setAiStatusNotice(
          data.error ||
            "Gemini service unavailable; generated deterministic local match."
        );
        setIsAiRunning(false);
        return;
      }

      const proposals: TailoredBulletProposal[] = Array.isArray(
        data.tailoredBullets
      )
        ? data.tailoredBullets.map(
            (
              b: {
                experienceId?: string;
                bulletIndex?: number;
                originalBullet?: string;
                tailoredBullet?: string;
                rationale?: string;
                ungroundedWarning?: string;
              },
              idx: number
            ) => {
              const cleanTailored = scrubAiTropesAndDashes(
                b.tailoredBullet || b.originalBullet || ""
              );
              const localAudit = auditBulletHonesty(
                cleanTailored,
                masterResume,
                existingConfirmed
              );
              const combinedWarning = [
                sanitizeDashes(b.ungroundedWarning || ""),
                localAudit,
              ]
                .filter(Boolean)
                .join(" ");

              return {
                id: `${b.experienceId || "exp"}_${b.bulletIndex ?? idx}_${idx}`,
                experienceId:
                  b.experienceId || masterResume.experience[0]?.id || "exp_1",
                bulletIndex: b.bulletIndex ?? idx,
                originalBullet: sanitizeDashes(b.originalBullet || ""),
                tailoredBullet: cleanTailored,
                rationale: sanitizeDashes(
                  b.rationale || "Aligned to job description"
                ),
                approved: combinedWarning.length === 0,
                ungroundedWarning: combinedWarning,
              };
            }
          )
        : [];

      const confirmableList = Array.isArray(data.missingSkillsToConfirm)
        ? data.missingSkillsToConfirm.map((s: string) => sanitizeDashes(s))
        : [];
      const learningList: string[] = Array.isArray(data.missingSkillsLearningOnly)
        ? data.missingSkillsLearningOnly.map((s: string) => sanitizeDashes(s))
        : [];

      const rawFound: string[] = Array.isArray(data.requiredSkillsFound)
        ? data.requiredSkillsFound.map((s: string) => sanitizeDashes(s))
        : [];
      const allLearning: string[] = [...confirmableList, ...learningList];
      const weighted = computeWeightedSkillMatchScore(
        rawFound,
        Math.max(1, rawFound.length + allLearning.length),
        { role: activeApp.role, jobDescription: cleanJd },
        masterResume
      );
      const rawFlags: string[] = Array.isArray(data.managerFlags)
        ? data.managerFlags.map((s: string) => sanitizeDashes(s))
        : [];
      if (weighted.seniorDepthGaps.length > 0) {
        rawFlags.unshift(
          `Depth check vs Strong/Senior job spec: ${weighted.seniorDepthGaps
            .map((g) => `${g.skill} (marked ${g.candidateWeight}/5)`)
            .join(
              ", "
            )}. Frame honestly around adjacent 4-5/5 strengths rather than overstating.`
        );
      }

      const built: TailoredWorkspace = {
        applicationId: activeApp.id,
        tailoredHeadline: workspace?.tailoredHeadline,
        tailoredSummary: workspace?.tailoredSummary,
        confirmedSkills: existingConfirmed,
        learningOnlySkills: allLearning,
        requiredSkillsFound: rawFound.sort(
          (a, b) => getSkillWeight(masterResume, b) - getSkillWeight(masterResume, a)
        ),
        matchScore: weighted.matchScore,
        bullets: proposals,
        coverLetter: scrubAiTropesAndDashes(data.coverLetter || ""),
        managerFlags: rawFlags,
        usedAiModel: true,
        updatedAt: new Date().toISOString(),
      };

      onSaveWorkspace(activeApp.id, built);
      setAiStatusNotice(
        "Privacy Notice: Processed with Gemini 3.8 Flash. Every bullet and 4-pillar cover letter paragraph was audited against your Master Resume."
      );
    } catch {
      const fallback = buildLocalTailoredWorkspace(
        { ...activeApp, jobDescription: cleanJd },
        masterResume,
        existingConfirmed
      );
      onSaveWorkspace(activeApp.id, fallback);
      setAiStatusNotice("Evaluated locally after network error.");
    } finally {
      setIsAiRunning(false);
    }
  };

  const handleGenerateAiCoverLetterOnly = async () => {
    if (!activeApp) return;
    const baseWs = ensurePersistedWorkspace();
    if (!baseWs) return;

    const cleanJd = sanitizeDashes(jdDraft.trim() || activeApp.jobDescription);
    setIsGeneratingLetter(true);
    setWorkspaceTab("coverletter");

    try {
      const resp = await fetch("/api/cover-letter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterResume,
          company: activeApp.company,
          role: activeApp.role,
          contactName: activeApp.contactName,
          jobDescription: cleanJd,
          confirmedSkills: baseWs.confirmedSkills,
          applicantNotes: sanitizeDashes(orgFitNote.trim()),
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.coverLetter) {
        onSaveWorkspace(activeApp.id, {
          ...baseWs,
          coverLetter: scrubAiTropesAndDashes(data.coverLetter),
          usedAiModel: true,
          updatedAt: new Date().toISOString(),
        });
        setAiStatusNotice(
          "Generated 4-pillar business cover letter with Gemini 3.8 Flash (zero AI cliches, zero long dashes)."
        );
      } else {
        const localLetter = buildFourPillarCoverLetter(
          { ...activeApp, jobDescription: cleanJd },
          masterResume,
          baseWs.requiredSkillsFound,
          baseWs.learningOnlySkills,
          orgFitNote
        );
        onSaveWorkspace(activeApp.id, {
          ...baseWs,
          coverLetter: localLetter,
          updatedAt: new Date().toISOString(),
        });
        setAiStatusNotice(
          data.error ||
            "Drafted 4-pillar cover letter locally from your Master Resume."
        );
      }
    } catch {
      const localLetter = buildFourPillarCoverLetter(
        { ...activeApp, jobDescription: cleanJd },
        masterResume,
        baseWs.requiredSkillsFound,
        baseWs.learningOnlySkills,
        orgFitNote
      );
      onSaveWorkspace(activeApp.id, {
        ...baseWs,
        coverLetter: localLetter,
        updatedAt: new Date().toISOString(),
      });
      setAiStatusNotice("Drafted 4-pillar cover letter locally.");
    } finally {
      setIsGeneratingLetter(false);
    }
  };

  const handleGenerateLocalFourPillarLetter = () => {
    if (!activeApp) return;
    const baseWs = ensurePersistedWorkspace();
    if (!baseWs) return;
    const letter = buildFourPillarCoverLetter(
      { ...activeApp, jobDescription: sanitizeDashes(jdDraft.trim()) },
      masterResume,
      baseWs.requiredSkillsFound,
      baseWs.learningOnlySkills,
      orgFitNote
    );
    onSaveWorkspace(activeApp.id, {
      ...baseWs,
      coverLetter: letter,
      updatedAt: new Date().toISOString(),
    });
    setWorkspaceTab("coverletter");
  };

  const handleInsertApplicantOutline = () => {
    if (!activeApp) return;
    const baseWs = ensurePersistedWorkspace();
    if (!baseWs) return;
    const outline = buildApplicantCoverLetterOutline(activeApp, masterResume);
    onSaveWorkspace(activeApp.id, {
      ...baseWs,
      coverLetter: outline,
      updatedAt: new Date().toISOString(),
    });
    setWorkspaceTab("coverletter");
  };

  const weightedEvaluation = useMemo(() => {
    if (!activeApp || !workspace) {
      return {
        matchScore: 0,
        skillFits: [],
        seniorDepthGaps: [],
      };
    }
    const effectiveJd = jdDraft.trim() || activeApp.jobDescription;
    const totalSkills = Math.max(
      1,
      workspace.requiredSkillsFound.length + workspace.learningOnlySkills.length
    );
    return computeWeightedSkillMatchScore(
      workspace.requiredSkillsFound,
      totalSkills,
      { role: activeApp.role, jobDescription: effectiveJd },
      masterResume
    );
  }, [activeApp, workspace, jdDraft, masterResume]);

  const confirmAndAddSkillToResume = (
    rawSkill: string,
    chosenWeight?: SkillWeight,
    chosenNote?: string
  ) => {
    if (!activeApp) return;
    const baseWs = ensurePersistedWorkspace();
    if (!baseWs) return;

    const cleanSkill = sanitizeDashes(rawSkill.trim());
    const key = normalizeSkillKey(cleanSkill);
    if (!cleanSkill || !key) return;

    const weight = clampSkillWeight(
      chosenWeight ?? pendingWeightBySkill[key] ?? 3,
      3
    );
    const note = sanitizeDashes(
      chosenNote !== undefined ? chosenNote : pendingNoteBySkill[key] || ""
    );

    const alreadyListed = masterResume.skills.some(
      (s) => normalizeSkillKey(s) === key
    );
    const updatedMaster: MasterResume = {
      ...masterResume,
      skills: alreadyListed
        ? masterResume.skills
        : [...masterResume.skills, cleanSkill],
      skillWeights: {
        ...(masterResume.skillWeights || {}),
        [key]: weight,
      },
      skillNotes: note
        ? {
            ...(masterResume.skillNotes || {}),
            [key]: note,
          }
        : masterResume.skillNotes || {},
    };

    if (onUpdateMasterResume) {
      onUpdateMasterResume(updatedMaster);
    }

    const nextConfirmed = baseWs.confirmedSkills.some(
      (s) => normalizeSkillKey(s) === key
    )
      ? baseWs.confirmedSkills
      : [...baseWs.confirmedSkills, cleanSkill];

    const nextFoundRaw = baseWs.requiredSkillsFound.some(
      (s) => normalizeSkillKey(s) === key
    )
      ? baseWs.requiredSkillsFound
      : [...baseWs.requiredSkillsFound, cleanSkill];

    const nextFound = [...nextFoundRaw].sort(
      (a, b) =>
        getSkillWeight(updatedMaster, b) - getSkillWeight(updatedMaster, a)
    );

    const nextLearning = baseWs.learningOnlySkills.filter(
      (s) => normalizeSkillKey(s) !== key
    );

    const totalSkills = Math.max(1, nextFound.length + nextLearning.length);
    const nextEval = computeWeightedSkillMatchScore(
      nextFound,
      totalSkills,
      {
        role: activeApp.role,
        jobDescription: jdDraft.trim() || activeApp.jobDescription,
      },
      updatedMaster
    );

    const reAuditedBullets = baseWs.bullets.map((b) => ({
      ...b,
      ungroundedWarning: auditBulletHonesty(
        b.tailoredBullet,
        updatedMaster,
        nextConfirmed
      ),
    }));

    onSaveWorkspace(activeApp.id, {
      ...baseWs,
      confirmedSkills: nextConfirmed,
      requiredSkillsFound: nextFound,
      learningOnlySkills: nextLearning,
      matchScore: nextEval.matchScore,
      bullets: reAuditedBullets,
      updatedAt: new Date().toISOString(),
    });
    setAiStatusNotice(
      `Confirmed "${cleanSkill}" at Weight ${weight}/5 and added to Master Resume.`
    );
  };

  const handleMoveSkillToLearningOnly = (skill: string) => {
    if (!activeApp || !workspace) return;
    const key = normalizeSkillKey(skill);
    const nextConfirmed = workspace.confirmedSkills.filter(
      (s) => normalizeSkillKey(s) !== key
    );
    const nextFound = workspace.requiredSkillsFound.filter(
      (s) => normalizeSkillKey(s) !== key
    );
    const nextLearning = workspace.learningOnlySkills.some(
      (s) => normalizeSkillKey(s) === key
    )
      ? workspace.learningOnlySkills
      : [...workspace.learningOnlySkills, skill];

    let updatedMaster = masterResume;
    if (
      onUpdateMasterResume &&
      masterResume.skills.some((s) => normalizeSkillKey(s) === key)
    ) {
      updatedMaster = {
        ...masterResume,
        skills: masterResume.skills.filter((s) => normalizeSkillKey(s) !== key),
      };
      onUpdateMasterResume(updatedMaster);
    }

    const totalSkills = Math.max(1, nextFound.length + nextLearning.length);
    const nextEval = computeWeightedSkillMatchScore(
      nextFound,
      totalSkills,
      {
        role: activeApp.role,
        jobDescription: jdDraft.trim() || activeApp.jobDescription,
      },
      updatedMaster
    );

    const reAuditedBullets = workspace.bullets.map((b) => ({
      ...b,
      ungroundedWarning: auditBulletHonesty(
        b.tailoredBullet,
        updatedMaster,
        nextConfirmed
      ),
    }));

    onSaveWorkspace(activeApp.id, {
      ...workspace,
      confirmedSkills: nextConfirmed,
      requiredSkillsFound: nextFound,
      learningOnlySkills: nextLearning,
      matchScore: nextEval.matchScore,
      bullets: reAuditedBullets,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateSkillWeightInline = (
    skill: string,
    nextWeight: SkillWeight
  ) => {
    if (!activeApp || !workspace) return;
    const key = normalizeSkillKey(skill);
    if (!key) return;
    const clamped = clampSkillWeight(nextWeight, 3);
    const alreadyInMaster = masterResume.skills.some(
      (s) => normalizeSkillKey(s) === key
    );
    const updatedMaster: MasterResume = {
      ...masterResume,
      skills: alreadyInMaster
        ? masterResume.skills
        : [...masterResume.skills, sanitizeDashes(skill.trim())],
      skillWeights: {
        ...(masterResume.skillWeights || {}),
        [key]: clamped,
      },
    };
    if (onUpdateMasterResume) {
      onUpdateMasterResume(updatedMaster);
    }

    const sortedFound = [...workspace.requiredSkillsFound].sort(
      (a, b) =>
        getSkillWeight(updatedMaster, b) - getSkillWeight(updatedMaster, a)
    );
    const totalSkills = Math.max(
      1,
      sortedFound.length + workspace.learningOnlySkills.length
    );
    const nextEval = computeWeightedSkillMatchScore(
      sortedFound,
      totalSkills,
      {
        role: activeApp.role,
        jobDescription: jdDraft.trim() || activeApp.jobDescription,
      },
      updatedMaster
    );

    onSaveWorkspace(activeApp.id, {
      ...workspace,
      requiredSkillsFound: sortedFound,
      matchScore: nextEval.matchScore,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateSkillNoteInline = (skill: string, note: string) => {
    const key = normalizeSkillKey(skill);
    if (!key || !onUpdateMasterResume) return;
    onUpdateMasterResume({
      ...masterResume,
      skillNotes: {
        ...(masterResume.skillNotes || {}),
        [key]: sanitizeDashes(note),
      },
    });
  };

  const toggleApproveBullet = (bulletId: string) => {
    if (!activeApp || !workspace) return;
    onSaveWorkspace(activeApp.id, {
      ...workspace,
      bullets: workspace.bullets.map((b) =>
        b.id === bulletId ? { ...b, approved: !b.approved } : b
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const updateTailoredBulletText = (bulletId: string, newText: string) => {
    if (!activeApp || !workspace) return;
    const clean = sanitizeDashes(newText);
    const warning = auditBulletHonesty(
      clean,
      masterResume,
      workspace.confirmedSkills
    );
    onSaveWorkspace(activeApp.id, {
      ...workspace,
      bullets: workspace.bullets.map((b) =>
        b.id === bulletId
          ? { ...b, tailoredBullet: clean, ungroundedWarning: warning }
          : b
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const updateTailoredHeadline = (text: string) => {
    if (!activeApp || !workspace) return;
    onSaveWorkspace(activeApp.id, {
      ...workspace,
      tailoredHeadline: sanitizeDashes(text),
      updatedAt: new Date().toISOString(),
    });
  };

  const updateTailoredSummary = (text: string) => {
    if (!activeApp || !workspace) return;
    onSaveWorkspace(activeApp.id, {
      ...workspace,
      tailoredSummary: sanitizeDashes(text),
      updatedAt: new Date().toISOString(),
    });
  };

  const updateCoverLetter = (text: string) => {
    if (!activeApp || !workspace) return;
    onSaveWorkspace(activeApp.id, {
      ...workspace,
      coverLetter: sanitizeDashes(text),
      updatedAt: new Date().toISOString(),
    });
  };

  const effectiveHeadline = useMemo(() => {
    if (workspace?.tailoredHeadline !== undefined) {
      return workspace.tailoredHeadline;
    }
    const defaults = activeApp?.role
      ? [activeApp.role, ...(masterResume.targetJobTitles || []).slice(0, 1)]
      : masterResume.targetJobTitles || [];
    return Array.from(new Set(defaults)).join(" | ");
  }, [workspace?.tailoredHeadline, activeApp?.role, masterResume.targetJobTitles]);

  const effectiveSummary = useMemo(() => {
    if (workspace?.tailoredSummary !== undefined) {
      return workspace.tailoredSummary;
    }
    return masterResume.summary;
  }, [workspace?.tailoredSummary, masterResume.summary]);

  const summaryHonestyWarning = useMemo(() => {
    if (!workspace?.tailoredSummary?.trim()) return "";
    return auditBulletHonesty(
      workspace.tailoredSummary,
      masterResume,
      workspace.confirmedSkills
    );
  }, [workspace?.tailoredSummary, workspace?.confirmedSkills, masterResume]);

  // Assemble clean plain-text screening output using approved bullets and all rich Master Resume fields
  const plainTextResume = useMemo(() => {
    const c = masterResume.contact;
    const allUrls = collectAllProfileUrls(c);
    const clearancePart =
      c.securityClearance && c.securityClearance.trim().toLowerCase() !== "none"
        ? `Clearance: ${c.securityClearance.trim()}`
        : "";
    const contactLine = [
      c.email,
      c.phone,
      c.location,
      c.workAuthorization,
      clearancePart,
      c.workPreference,
      ...allUrls,
    ]
      .filter(Boolean)
      .join(" | ");

    const { coreSkills, basicSkills } = partitionAndSortSkillsByWeight(
      masterResume,
      workspace?.confirmedSkills || []
    );

    const expBlocks = masterResume.experience.map((exp) => {
      const compTag = formatExperienceComplianceTag(exp);
      const roleBullets = exp.bullets.map((origBullet, idx) => {
        const proposal = workspace?.bullets.find(
          (b) => b.experienceId === exp.id && b.bulletIndex === idx
        );
        if (proposal && proposal.approved && !proposal.ungroundedWarning) {
          return `- ${proposal.tailoredBullet}`;
        }
        return `- ${origBullet}`;
      });

      const headerMeta = [
        exp.role,
        exp.company,
        exp.location,
        compTag,
        `(${exp.startDate} - ${exp.endDate})`,
      ]
        .filter(Boolean)
        .join(" | ");

      return `${headerMeta}\n${roleBullets.join("\n")}`;
    });

    const projBlocks = (masterResume.projects || []).map((p) => {
      const head = [p.name, p.techStack, p.url].filter(Boolean).join(" | ");
      return p.description ? `${head}\n- ${p.description}` : head;
    });

    const eduBlocks = masterResume.education.map(
      (ed) => `${ed.degree}, ${ed.institution} (${ed.year})`
    );

    const summaryToPrint = summaryHonestyWarning
      ? masterResume.summary
      : effectiveSummary;

    return sanitizeDashes(
      [
        (c.name || "CANDIDATE NAME").toUpperCase(),
        ...(effectiveHeadline.trim() ? [effectiveHeadline.trim()] : []),
        contactLine,
        "",
        "PROFESSIONAL SUMMARY",
        summaryToPrint,
        "",
        "SKILLS",
        coreSkills.join(", "),
        ...(basicSkills.length > 0 &&
        masterResume.includeWeightOneOnResume !== false
          ? [
              `Foundational Familiarity: ${basicSkills.join(", ")}`,
            ]
          : []),
        ...((masterResume.atsKeywords || []).length > 0
          ? ["", "DOMAIN KEYWORDS", masterResume.atsKeywords.join(", ")]
          : []),
        ...((masterResume.aiUsage || []).length > 0
          ? [
              "",
              "AI FLUENCY & WORKFLOWS",
              ...masterResume.aiUsage.map((a) => `- ${a}`),
            ]
          : []),
        "",
        "EXPERIENCE",
        expBlocks.join("\n\n"),
        ...(projBlocks.length > 0
          ? ["", "PERSONAL PROJECTS", projBlocks.join("\n\n")]
          : []),
        ...((masterResume.accomplishments || []).length > 0
          ? [
              "",
              "KEY ACCOMPLISHMENTS",
              ...masterResume.accomplishments.map((a) => `- ${a}`),
            ]
          : []),
        "",
        "EDUCATION",
        eduBlocks.join("\n"),
        ...(masterResume.certifications.length > 0
          ? ["", "CERTIFICATIONS", masterResume.certifications.join("\n")]
          : []),
      ].join("\n")
    );
  }, [masterResume, workspace, effectiveHeadline, effectiveSummary, summaryHonestyWarning]);

  const handleExportPlainText = () => {
    const blob = new Blob([plainTextResume], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = activeApp
      ? `${activeApp.company}_${activeApp.role}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
      : "tailored_resume";
    a.download = `${slug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPrintHtml = () => {
    const c = masterResume.contact;
    const allUrls = collectAllProfileUrls(c);
    const clearancePart =
      c.securityClearance && c.securityClearance.trim().toLowerCase() !== "none"
        ? `Clearance: ${c.securityClearance.trim()}`
        : "";
    const { coreSkills, basicSkills } = partitionAndSortSkillsByWeight(
      masterResume,
      workspace?.confirmedSkills || []
    );
    const summaryToPrint = summaryHonestyWarning
      ? masterResume.summary
      : effectiveSummary;

    const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${c.name || "Resume"} - ${activeApp?.company || ""}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #111827; max-width: 760px; margin: 36px auto; padding: 0 24px; line-height: 1.45; font-size: 10.5pt; }
  h1 { font-size: 18pt; margin: 0 0 2px 0; letter-spacing: -0.01em; }
  .headline { font-weight: 700; color: #1e40af; font-size: 10.5pt; margin-bottom: 4px; }
  .contact { font-size: 9.5pt; color: #374151; margin-bottom: 16px; }
  h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; margin: 16px 0 8px 0; }
  .role-head { display: flex; justify-content: space-between; font-weight: 600; margin-top: 8px; }
  ul { margin: 4px 0 10px 18px; padding: 0; }
  li { margin-bottom: 3px; }
</style>
</head>
<body>
  <h1>${c.name || "Candidate"}</h1>
  ${effectiveHeadline.trim() ? `<div class="headline">${effectiveHeadline.trim()}</div>` : ""}
  <div class="contact">${[
    c.email,
    c.phone,
    c.location,
    c.workAuthorization,
    clearancePart,
    c.workPreference,
    ...allUrls,
  ]
    .filter(Boolean)
    .join(" | ")}</div>
  <h2>Professional Summary</h2>
  <p>${summaryToPrint}</p>
  <h2>Core Skills & Keywords</h2>
  ${coreSkills.length > 0 ? `<p><strong>Skills:</strong> ${coreSkills.join(", ")}</p>` : ""}
  ${
    basicSkills.length > 0 && masterResume.includeWeightOneOnResume !== false
      ? `<p><strong>Foundational Familiarity:</strong> ${basicSkills.join(", ")}</p>`
      : ""
  }
  ${
    (masterResume.atsKeywords || []).length > 0
      ? `<p><strong>Domain & Methodologies:</strong> ${masterResume.atsKeywords.join(", ")}</p>`
      : ""
  }
  ${
    (masterResume.aiUsage || []).length > 0
      ? `<h2>AI Fluency & Workflows</h2><ul>${masterResume.aiUsage
          .map((item) => `<li>${item}</li>`)
          .join("")}</ul>`
      : ""
  }
  <h2>Work Experience</h2>
  ${masterResume.experience
    .map((exp) => {
      const compTag = formatExperienceComplianceTag(exp);
      const lis = exp.bullets
        .map((orig, idx) => {
          const prop = workspace?.bullets.find(
            (b) => b.experienceId === exp.id && b.bulletIndex === idx
          );
          const txt =
            prop && prop.approved && !prop.ungroundedWarning
              ? prop.tailoredBullet
              : orig;
          return `<li>${txt}</li>`;
        })
        .join("");
      const metaLeft = [exp.role, exp.company, exp.location, compTag]
        .filter(Boolean)
        .join(" | ");
      return `<div class="role-head"><span>${metaLeft}</span><span>${exp.startDate} - ${exp.endDate}</span></div><ul>${lis}</ul>`;
    })
    .join("")}
  ${
    (masterResume.projects || []).length > 0
      ? `<h2>Personal Projects</h2>${masterResume.projects
          .map(
            (p) =>
              `<div><strong>${[p.name, p.techStack, p.url]
                .filter(Boolean)
                .join(" | ")}</strong>${
                p.description ? `<p>${p.description}</p>` : ""
              }</div>`
          )
          .join("")}`
      : ""
  }
  ${
    (masterResume.accomplishments || []).length > 0
      ? `<h2>Key Accomplishments</h2><ul>${masterResume.accomplishments
          .map((a) => `<li>${a}</li>`)
          .join("")}</ul>`
      : ""
  }
  <h2>Education</h2>
  ${masterResume.education
    .map(
      (ed) =>
        `<div><strong>${ed.degree}</strong>, ${ed.institution} (${ed.year})</div>`
    )
    .join("")}
  ${
    masterResume.certifications.length > 0
      ? `<h2>Certifications</h2><ul>${masterResume.certifications
          .map((cert) => `<li>${cert}</li>`)
          .join("")}</ul>`
      : ""
  }
</body>
</html>`;

    const blob = new Blob([sanitizeDashes(htmlDoc)], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = activeApp
      ? `${activeApp.company}_print_resume`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
      : "print_ready_resume";
    a.download = `${slug}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTailoredResumePdf = () => {
    const safeWs = workspace
      ? {
          ...workspace,
          tailoredSummary: summaryHonestyWarning
            ? masterResume.summary
            : workspace.tailoredSummary,
        }
      : null;
    downloadResumePdf(masterResume, {
      targetApp: activeApp,
      workspace: safeWs,
    });
  };

  const handleDownloadTailoredCoverLetterPdf = () => {
    const body =
      workspace?.coverLetter?.trim() ||
      (activeApp
        ? buildFourPillarCoverLetter(
            activeApp,
            masterResume,
            workspace?.requiredSkillsFound || [],
            workspace?.learningOnlySkills || [],
            orgFitNote
          )
        : masterResume.defaultCoverLetter || "");
    downloadCoverLetterPdf(masterResume, body, {
      targetCompany: activeApp?.company,
      targetRole: activeApp?.role,
    });
  };

  if (applications.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Match & Tailoring Studio
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Create a target job below to tailor your Master Resume and 4-pillar Cover Letter, or download your baseline Master Resume PDF right now.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => downloadResumePdf(masterResume)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5" />
                Download Master Resume (.pdf)
              </button>
              {onNavigateResume && (
                <button
                  type="button"
                  onClick={onNavigateResume}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <FileEdit className="h-3.5 w-3.5 text-slate-500" />
                  Edit Master Resume
                </button>
              )}
            </div>
          </div>

          {onCreateQuickApplication && (
            <form onSubmit={handleQuickJobSubmit} className="mt-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Paste Target Job Description to Start Tailoring
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Target Company *
                  </label>
                  <input
                    type="text"
                    required
                    value={quickCompany}
                    onChange={(e) => setQuickCompany(e.target.value)}
                    placeholder="e.g. Stripe, Northrop Grumman, Adobe"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Target Role Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={quickRole}
                    onChange={(e) => setQuickRole(e.target.value)}
                    placeholder="e.g. Senior Systems Engineer"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Job Description
                </label>
                <textarea
                  value={quickJd}
                  onChange={(e) => setQuickJd(e.target.value)}
                  rows={6}
                  placeholder="Paste full job description requirements and responsibilities here..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-xs leading-relaxed focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Create Target Job & Open Tailoring Studio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreateQuickApplication(
                      "Topstep",
                      "Mid-Level Software Engineer",
                      TOPSTEP_JOB_DESCRIPTION
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Load Topstep Mid-Level Software Engineer (OptimHire Test)
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  const clWords = countWords(workspace?.coverLetter || "");
  const clBanned = detectBannedPhrases(workspace?.coverLetter || "");
  const clHasLongDash = detectLongDashes(workspace?.coverLetter || "");

  return (
    <div className="space-y-6">
      {/* Header + Direct Selectable-Text PDF Downloads + Target Selector */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between no-print">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>
              {workspace?.usedAiModel
                ? "Privacy Notice: Grounded Gemini AI tailoring active (private raw brainstorm notes stripped)"
                : "Privacy Notice: Deterministic local matching active (in-browser only)"}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Match & Tailoring Studio
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Uses your Master Resume as the template. Edit any tailored headline, summary, bullet, or cover letter below and download selectable-text PDFs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadTailoredResumePdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5" />
            Download Tailored Resume (.pdf)
          </button>
          <button
            type="button"
            onClick={handleDownloadTailoredCoverLetterPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5 text-slate-500" />
            Download Cover Letter (.pdf)
          </button>
          {onNavigateResume && (
            <button
              type="button"
              onClick={onNavigateResume}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <FileEdit className="h-3.5 w-3.5 text-slate-500" />
              Edit Master Template
            </button>
          )}
        </div>
      </div>

      {/* Target Application Selector + Editable Role/Company/Contact + Quick Add */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-900">
              Select Target Application ({applications.length})
            </label>
            <select
              value={activeApp?.id || ""}
              onChange={(e) => onSelectAppId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.role} - {app.company} (
                  {isApplicationRejected(app)
                    ? `Rejected${app.rejectedAt ? ` ${app.rejectedAt}` : ""}`
                    : app.stage}
                  )
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeApp && onUpdateApplication && (
              <button
                type="button"
                onClick={handleToggleActiveRejected}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium whitespace-nowrap cursor-pointer ${
                  isApplicationRejected(activeApp)
                    ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    : "border-red-200 bg-white text-red-700 hover:bg-red-50"
                }`}
              >
                {isApplicationRejected(activeApp) ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen Role
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5" />
                    Mark Rejected
                  </>
                )}
              </button>
            )}
            {onCreateQuickApplication && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCreateQuickApplication(
                      "Topstep",
                      "Mid-Level Software Engineer",
                      TOPSTEP_JOB_DESCRIPTION
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 whitespace-nowrap cursor-pointer"
                  title="Load real Topstep Software Engineer posting (OptimHire autofill tested)"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  Load Topstep (Trading Platform)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreateQuickApplication(
                      "Handshake AI",
                      "Senior AI Evaluation & Reliability Engineer",
                      HANDSHAKE_AI_JOB_DESCRIPTION
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 whitespace-nowrap cursor-pointer"
                  title="Load Handshake AI Senior Evaluation & Reliability Engineer target posting"
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  Load Handshake AI (Evaluation Engineer)
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickJobForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {showQuickJobForm ? "Hide New Target Job" : "New Target Job"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Rejected Status or Prior Rejected Repeat Flag on Active Target Job */}
        {activeApp && isApplicationRejected(activeApp) && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-950">
            <div className="flex items-center gap-1.5 font-semibold text-red-800">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>
                This role is marked Rejected
                {activeApp.rejectedAt ? ` (${activeApp.rejectedAt})` : ""}
                {activeApp.rejectionStage
                  ? ` after ${activeApp.rejectionStage}`
                  : ""}
              </span>
            </div>
            <p className="mt-1 text-red-900">
              {activeApp.rejectionNotes
                ? `Recorded note: ${activeApp.rejectionNotes}`
                : "If a repost or duplicate of this job comes up again in Job Boards, Pipeline, or Tailoring, it will be automatically flagged."}
            </p>
          </div>
        )}

        {activePriorRejectedMatch && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Flagged Repeat Job · Previously Rejected for{" "}
                  {activePriorRejectedMatch.app.role} at{" "}
                  {activePriorRejectedMatch.app.company}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSelectAppId(activePriorRejectedMatch.app.id)}
                className="font-medium text-red-800 underline hover:text-red-950 cursor-pointer"
              >
                Switch to Prior Rejected Record
              </button>
            </div>
            <p className="mt-1 text-red-900">
              Matched via {activePriorRejectedMatch.reasonLabel.toLowerCase()}
              {activePriorRejectedMatch.app.rejectedAt
                ? ` · Rejected on ${activePriorRejectedMatch.app.rejectedAt}`
                : ""}
              {activePriorRejectedMatch.app.rejectionStage
                ? ` after ${activePriorRejectedMatch.app.rejectionStage}`
                : ""}
              {activePriorRejectedMatch.app.rejectionNotes
                ? ` · "${activePriorRejectedMatch.app.rejectionNotes}"`
                : ""}
              .
            </p>
          </div>
        )}

        {showQuickJobForm && onCreateQuickApplication && (
          <form
            onSubmit={handleQuickJobSubmit}
            className="mt-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4"
          >
            <div className="text-xs font-semibold text-slate-900">
              Create New Target Job for Immediate Tailoring
            </div>

            {quickJobPriorMatches.length > 0 && (() => {
              const top = quickJobPriorMatches[0];
              return (
                <div
                  className={`rounded-lg border p-3 text-xs ${
                    top.isRejected
                      ? "border-red-200 bg-red-50 text-red-950"
                      : "border-amber-200 bg-amber-50 text-amber-950"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {top.isRejected
                          ? "Flagged Repeat Job · Previously Rejected"
                          : "Already in Pipeline"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAppId(top.app.id);
                        setShowQuickJobForm(false);
                      }}
                      className="font-medium underline cursor-pointer"
                    >
                      Open Prior Record
                    </button>
                  </div>
                  <p className="mt-1">
                    Matches <strong>{top.app.role}</strong> at{" "}
                    <strong>{top.app.company}</strong> ({top.reasonLabel.toLowerCase()})
                    {top.isRejected && top.app.rejectedAt
                      ? ` · Rejected on ${top.app.rejectedAt}`
                      : ""}
                    {top.isRejected && top.app.rejectionNotes
                      ? ` · "${top.app.rejectionNotes}"`
                      : ""}
                    .
                  </p>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                required
                value={quickCompany}
                onChange={(e) => setQuickCompany(e.target.value)}
                placeholder="Company Name *"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
              />
              <input
                type="text"
                required
                value={quickRole}
                onChange={(e) => setQuickRole(e.target.value)}
                placeholder="Role Title *"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
              />
            </div>
            <textarea
              value={quickJd}
              onChange={(e) => setQuickJd(e.target.value)}
              rows={3}
              placeholder="Paste job description..."
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowQuickJobForm(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
              >
                Add & Switch to Job
              </button>
            </div>
          </form>
        )}

        {/* Collapsible Active Target Job Metadata & JD */}
        {activeApp && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            {!isJdExpanded && jdDraft.trim() ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50/80 px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{activeApp.role}</span>
                  <span className="text-slate-400">at</span>
                  <span className="font-semibold text-slate-900">{activeApp.company}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono font-semibold tabular-nums text-blue-700">
                    {weightedEvaluation.matchScore}% Match
                  </span>
                  <span className="text-slate-500">
                    ({getMatchVerdict(weightedEvaluation.matchScore, weightedEvaluation.seniorDepthGaps.length).verdict})
                  </span>
                  {activeApp.contactName && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-600">Contact: {activeApp.contactName}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsJdExpanded(true)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Edit Role &amp; Job Description
                  </button>
                  <button
                    type="button"
                    onClick={handleRunLocalAnalysis}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Recalculate
                  </button>
                  <button
                    type="button"
                    disabled={isAiRunning}
                    onClick={handleRunGeminiTailor}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
                  >
                    <RefreshCw className={`h-3 w-3 ${isAiRunning ? "animate-spin" : ""}`} />
                    {isAiRunning ? "Tailoring..." : "Tailor with Gemini AI"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    Target Role Details &amp; Job Description
                  </span>
                  {jdDraft.trim() && (
                    <button
                      type="button"
                      onClick={() => setIsJdExpanded(false)}
                      className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                    >
                      Hide Details
                    </button>
                  )}
                </div>

                {onUpdateApplication && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Target Company (Editable)
                      </label>
                      <input
                        type="text"
                        value={activeApp.company}
                        onChange={(e) =>
                          handleUpdateActiveAppMeta({
                            company: sanitizeDashes(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Target Role Title (Editable)
                      </label>
                      <input
                        type="text"
                        value={activeApp.role}
                        onChange={(e) =>
                          handleUpdateActiveAppMeta({
                            role: sanitizeDashes(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Hiring Manager / Recruiter Name (for Cover Letter)
                      </label>
                      <input
                        type="text"
                        value={activeApp.contactName}
                        onChange={(e) =>
                          handleUpdateActiveAppMeta({
                            contactName: sanitizeDashes(e.target.value),
                          })
                        }
                        placeholder="Optional (defaults to Hiring Team)"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Job Description Requirements &amp; Responsibilities
                  </label>
                  <textarea
                    value={jdDraft}
                    onChange={(e) => setJdDraft(sanitizeDashes(e.target.value))}
                    rows={4}
                    placeholder="Paste full job description requirements and responsibilities here..."
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs leading-relaxed text-slate-800 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunLocalAnalysis}
                      className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Run Local Match
                    </button>
                    <button
                      type="button"
                      disabled={isAiRunning}
                      onClick={handleRunGeminiTailor}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${isAiRunning ? "animate-spin" : ""}`}
                      />
                      {isAiRunning
                        ? "Tailoring..."
                        : "Tailor Resume & Cover Letter with Gemini AI"}
                    </button>
                    {jdDraft.trim() && (
                      <button
                        type="button"
                        onClick={() => setIsJdExpanded(false)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Done Editing
                      </button>
                    )}
                  </div>
                  {aiStatusNotice && (
                    <span className="text-xs text-slate-600">{aiStatusNotice}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {workspace && activeApp && (
        <div className="space-y-6">
          {/* Main 3-Tab Workflow Switcher: 01 Resume, 02 Cover Letter, 03 Reader & ATS */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-1 no-print">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setWorkspaceTab("resume")}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  workspaceTab === "resume"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                01. Tailored Resume &amp; Bullets ({weightedEvaluation.matchScore}% Match)
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab("coverletter")}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  workspaceTab === "coverletter"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                02. 4-Pillar Cover Letter
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab("audit")}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  workspaceTab === "audit"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                03. Reader &amp; ATS Previews
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              {workspaceTab === "resume" && (
                <button
                  type="button"
                  onClick={handleDownloadTailoredResumePdf}
                  className="inline-flex items-center gap-1.5 font-medium text-slate-800 hover:text-blue-600 cursor-pointer"
                >
                  <FileDown className="h-3.5 w-3.5 text-blue-600" />
                  Download Tailored Resume (.pdf)
                </button>
              )}
              {workspaceTab === "coverletter" && (
                <button
                  type="button"
                  onClick={handleDownloadTailoredCoverLetterPdf}
                  className="inline-flex items-center gap-1.5 font-medium text-slate-800 hover:text-blue-600 cursor-pointer"
                >
                  <FileDown className="h-3.5 w-3.5 text-blue-600" />
                  Download Cover Letter (.pdf)
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: TAILORED RESUME & BULLETS */}
          {workspaceTab === "resume" && (
            <>
              {/* Match Score & 1-5 Weighted Skills Breakdown */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 no-print">
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-4">
              <div>
                <div className="text-xs text-slate-500">
                  Proficiency-Weighted Fit Assessment
                </div>
                {(() => {
                  const score = Math.min(
                    100,
                    Math.max(0, weightedEvaluation.matchScore)
                  );
                  const gapCount = weightedEvaluation.seniorDepthGaps.length;
                  const radius = 38;
                  const circumference = 2 * Math.PI * radius;
                  const dashOffset =
                    circumference - (score / 100) * circumference;
                  const v = getMatchVerdict(score, gapCount);
                  const strokeColor =
                    v.verdict === "Strong fit"
                      ? "#16a34a"
                      : v.verdict === "Worth it with tailoring"
                      ? "#2563eb"
                      : "#d97706";
                  const verdictTextClass =
                    v.verdict === "Strong fit"
                      ? "text-emerald-700"
                      : v.verdict === "Worth it with tailoring"
                      ? "text-blue-700"
                      : "text-amber-700";

                  return (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center gap-5">
                        <div className="relative h-24 w-24 shrink-0">
                          <svg
                            viewBox="0 0 96 96"
                            className="h-24 w-24 -rotate-90"
                            role="img"
                            aria-label={`Weighted match score ${score} out of 100`}
                          >
                            <circle
                              cx="48"
                              cy="48"
                              r={radius}
                              fill="none"
                              stroke="#f1f5f9"
                              strokeWidth="8"
                            />
                            <circle
                              cx="48"
                              cy="48"
                              r={radius}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth="8"
                              strokeLinecap="round"
                              strokeDasharray={circumference}
                              strokeDashoffset={dashOffset}
                              className="transition-all duration-200"
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="font-mono text-2xl font-bold leading-none tabular-nums text-slate-900">
                              {score}
                            </span>
                            <span className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-400">
                              / 100
                            </span>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div
                            className={`text-sm font-semibold ${verdictTextClass}`}
                          >
                            {v.verdict}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">
                            {v.summary}
                          </p>
                        </div>
                      </div>

                      {gapCount > 0 && (
                        <div className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-amber-900">
                          <strong>Strong / Senior Job Spec Check:</strong>{" "}
                          {weightedEvaluation.seniorDepthGaps
                            .map(
                              (g) =>
                                `${g.skill} (marked ${g.candidateWeight}/5 vs Strong/Senior spec: ${g.fitVerdict})`
                            )
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                1: Basic / Name (add experience) · 2-3: Some to Substantial · 4: Strong · 5: Expert
              </div>
            </div>

            <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-8">
              {/* Matched Skills with Editable 1-5 Weights & Job Spec Fit Rating */}
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-900">
                    Matched Skills in Resume & Job-Specified Depth Rating (
                    <span className="font-mono tabular-nums">
                      {weightedEvaluation.skillFits.length}
                    </span>
                    )
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Adjust any 1-5 weight to recalculate Strong fit / Worth it with tailoring / Stretch
                  </span>
                </div>

                {weightedEvaluation.skillFits.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No matched skills yet. Confirm any real skills from your experience below.
                  </p>
                ) : (
                  <div className="mt-2.5 divide-y divide-slate-100 border-t border-slate-100">
                    {weightedEvaluation.skillFits.map((fit) => {
                      const note = getSkillNote(masterResume, fit.skill);
                      const isAddedViaConfirm = workspace.confirmedSkills.some(
                        (s) =>
                          normalizeSkillKey(s) === normalizeSkillKey(fit.skill)
                      );
                      const verdictColor =
                        fit.fitVerdict === "Strong fit"
                          ? "text-emerald-700 font-semibold"
                          : fit.fitVerdict === "Worth it with tailoring"
                          ? "text-blue-700 font-semibold"
                          : "text-amber-700 font-semibold";

                      return (
                        <div key={fit.skill} className="py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                <span className="font-semibold text-slate-900">
                                  {fit.skill}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-300"
                                >
                                  ·
                                </span>
                                <span className="text-slate-500">
                                  Job spec: {fit.jobSpecLabel}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-300"
                                >
                                  ·
                                </span>
                                <span className={verdictColor}>
                                  {fit.fitVerdict}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {fit.detail}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                value={fit.candidateWeight}
                                onChange={(e) =>
                                  handleUpdateSkillWeightInline(
                                    fit.skill,
                                    clampSkillWeight(
                                      Number(e.target.value),
                                      3
                                    )
                                  )
                                }
                                aria-label={`1-5 skill weight for ${fit.skill}`}
                                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none"
                              >
                                {([1, 2, 3, 4, 5] as SkillWeight[]).map(
                                  (lvl) => (
                                    <option key={lvl} value={lvl}>
                                      {SKILL_WEIGHT_RUBRIC[lvl].shortLabel}
                                    </option>
                                  )
                                )}
                              </select>
                              {isAddedViaConfirm && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveSkillToLearningOnly(fit.skill)
                                  }
                                  className="text-[11px] text-slate-500 hover:text-red-600 whitespace-nowrap cursor-pointer"
                                  title="Move back to Learning Only and remove from Resume"
                                >
                                  Unconfirm
                                </button>
                              )}
                            </div>
                          </div>

                          {fit.candidateWeight === 1 && (
                            <div className="mt-2">
                              <input
                                type="text"
                                value={note}
                                onChange={(e) =>
                                  handleUpdateSkillNoteInline(
                                    fit.skill,
                                    e.target.value
                                  )
                                }
                                placeholder={`1 · Basic / Name: Add some hands-on experience or project context for ${fit.skill}...`}
                                className="w-full rounded border border-amber-300 bg-amber-50/40 px-2.5 py-1 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Unlisted Skills in Job Listing -> Confirm, Weight 1-5 & Add to Master Resume */}
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-xs font-semibold text-slate-900">
                  Not Listed in Master Resume - Confirm, Weight (1-5) & Add if Confirmed (
                  <span className="font-mono tabular-nums">
                    {workspace.learningOnlySkills.length}
                  </span>
                  )
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Interview Readiness Rule: Confirm only skills where you can readily answer live interview questions. Confirmed skills are weighted 1-5 and added to your Master Resume; unconfirmed skills remain in <em>Learning Only</em>.
                </p>

                {workspace.learningOnlySkills.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    All detected job requirements are already listed in your Master Resume.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {workspace.learningOnlySkills.map((skill) => {
                      const key = normalizeSkillKey(skill);
                      const chosenW = pendingWeightBySkill[key] || 3;
                      const chosenNote = pendingNoteBySkill[key] || "";
                      const previewFit = evaluateJobSkillRequirement(
                        skill,
                        jdDraft.trim() || activeApp.jobDescription,
                        activeApp.role,
                        {
                          ...masterResume,
                          skillWeights: {
                            ...(masterResume.skillWeights || {}),
                            [key]: chosenW,
                          },
                        }
                      );

                      return (
                        <div
                          key={key}
                          className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 text-xs">
                                <span className="font-semibold text-slate-900">
                                  {skill}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-300"
                                >
                                  ·
                                </span>
                                <span className="text-slate-500">
                                  Job spec: {previewFit.jobSpecLabel}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-300"
                                >
                                  ·
                                </span>
                                <span
                                  className={
                                    previewFit.fitVerdict === "Strong fit"
                                      ? "font-medium text-emerald-700"
                                      : previewFit.fitVerdict ===
                                        "Worth it with tailoring"
                                      ? "font-medium text-blue-700"
                                      : "font-medium text-amber-700"
                                  }
                                >
                                  At {chosenW}/5: {previewFit.fitVerdict}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <select
                                value={chosenW}
                                onChange={(e) =>
                                  setPendingWeightBySkill((prev) => ({
                                    ...prev,
                                    [key]: clampSkillWeight(
                                      Number(e.target.value),
                                      3
                                    ),
                                  }))
                                }
                                aria-label={`Select 1-5 weight before confirming ${skill}`}
                                className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none"
                              >
                                {([1, 2, 3, 4, 5] as SkillWeight[]).map(
                                  (lvl) => (
                                    <option key={lvl} value={lvl}>
                                      {SKILL_WEIGHT_RUBRIC[lvl].shortLabel}
                                    </option>
                                  )
                                )}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  confirmAndAddSkillToResume(
                                    skill,
                                    chosenW,
                                    chosenNote
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Confirm & Add to Resume
                              </button>
                            </div>
                          </div>

                          {chosenW === 1 && (
                            <input
                              type="text"
                              value={chosenNote}
                              onChange={(e) =>
                                setPendingNoteBySkill((prev) => ({
                                  ...prev,
                                  [key]: sanitizeDashes(e.target.value),
                                }))
                              }
                              placeholder={`1 · Basic / Name: Add some experience or context for ${skill}...`}
                              className="mt-2 w-full rounded border border-amber-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Manual Confirm & Add Another Unlisted Skill */}
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="text-[11px] font-medium text-slate-600">
                    Confirm & add another unlisted skill from this job posting:
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 sm:flex-nowrap">
                    <input
                      type="text"
                      value={customConfirmSkill}
                      onChange={(e) => setCustomConfirmSkill(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customConfirmSkill.trim()) {
                          e.preventDefault();
                          confirmAndAddSkillToResume(
                            customConfirmSkill,
                            customConfirmWeight,
                            customConfirmNote
                          );
                          setCustomConfirmSkill("");
                          setCustomConfirmNote("");
                        }
                      }}
                      placeholder="e.g. Kubernetes, Terraform, gRPC, Stakeholder Alignment"
                      className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                    />
                    <select
                      value={customConfirmWeight}
                      onChange={(e) =>
                        setCustomConfirmWeight(
                          clampSkillWeight(Number(e.target.value), 3)
                        )
                      }
                      aria-label="Weight 1-5 for custom confirmed skill"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs tabular-nums text-slate-800"
                    >
                      {([1, 2, 3, 4, 5] as SkillWeight[]).map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {SKILL_WEIGHT_RUBRIC[lvl].shortLabel}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!customConfirmSkill.trim()}
                      onClick={() => {
                        confirmAndAddSkillToResume(
                          customConfirmSkill,
                          customConfirmWeight,
                          customConfirmNote
                        );
                        setCustomConfirmSkill("");
                        setCustomConfirmNote("");
                      }}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Confirm & Add
                    </button>
                  </div>
                  {customConfirmWeight === 1 && (
                    <input
                      type="text"
                      value={customConfirmNote}
                      onChange={(e) =>
                        setCustomConfirmNote(sanitizeDashes(e.target.value))
                      }
                      placeholder="1 · Basic / Name: Add some hands-on experience or context..."
                      className="mt-1.5 w-full rounded border border-amber-300 bg-amber-50/40 px-2.5 py-1 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                    />
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Editable Tailored Headline, Summary & Side-by-Side Bullet Diff */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 no-print space-y-5">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-base font-semibold text-slate-900">
                Editable Tailored Headline, Summary & Experience Bullets
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Customize your top-of-resume headline, professional summary, and experience bullets for {activeApp.company}. Any unverified number or unlisted skill triggers a bold red Honesty Check flag; if you truly possess an unlisted skill, confirm & weight it inline to add it to your Master Resume.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">
                    Tailored Top Headline (Printed under Name on PDF)
                  </label>
                  {workspace.tailoredHeadline !== undefined && (
                    <button
                      type="button"
                      onClick={() => updateTailoredHeadline("")}
                      className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={effectiveHeadline}
                  onChange={(e) => updateTailoredHeadline(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer | Distributed Systems"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="lg:col-span-7">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">
                    Tailored Professional Summary (Editable for {activeApp.company})
                  </label>
                  {workspace.tailoredSummary !== undefined &&
                    workspace.tailoredSummary !== masterResume.summary && (
                      <button
                        type="button"
                        onClick={() =>
                          updateTailoredSummary(masterResume.summary)
                        }
                        className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                      >
                        Reset to Master Summary
                      </button>
                    )}
                </div>
                <textarea
                  value={effectiveSummary}
                  onChange={(e) => updateTailoredSummary(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                {summaryHonestyWarning && (
                  <div className="mt-1.5 space-y-1.5">
                    <p className="flex items-start gap-1.5 text-xs font-bold text-red-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{summaryHonestyWarning}</span>
                    </p>
                    {findUnconfirmedSkillsInText(
                      effectiveSummary,
                      masterResume,
                      workspace.confirmedSkills
                    ).map((unlisted) => {
                      const key = normalizeSkillKey(unlisted);
                      const w = pendingWeightBySkill[key] || 3;
                      return (
                        <div
                          key={key}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                        >
                          <span className="text-slate-700">
                            Not in Resume: <strong>{unlisted}</strong> - confirm if you have real experience:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={w}
                              onChange={(e) =>
                                setPendingWeightBySkill((prev) => ({
                                  ...prev,
                                  [key]: clampSkillWeight(
                                    Number(e.target.value),
                                    3
                                  ),
                                }))
                              }
                              aria-label={`Weight for ${unlisted}`}
                              className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] tabular-nums"
                            >
                              {([1, 2, 3, 4, 5] as SkillWeight[]).map((lvl) => (
                                <option key={lvl} value={lvl}>
                                  {SKILL_WEIGHT_RUBRIC[lvl].shortLabel}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                confirmAndAddSkillToResume(unlisted, w)
                              }
                              className="rounded bg-blue-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 whitespace-nowrap cursor-pointer"
                            >
                              Confirm & Add
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="divide-y divide-slate-200 border-t border-slate-200 pt-4">
              {workspace.bullets.length === 0 ? (
                <p className="py-4 text-xs text-slate-500">
                  Add experience bullets in your Master Resume to compare and edit tailored alignments.
                </p>
              ) : (
                workspace.bullets.map((b) => {
                  const parentRole = masterResume.experience.find(
                    (e) => e.id === b.experienceId
                  );
                  const bulletUnlistedSkills = b.ungroundedWarning
                    ? findUnconfirmedSkillsInText(
                        b.tailoredBullet,
                        masterResume,
                        workspace.confirmedSkills
                      )
                    : [];

                  return (
                    <div key={b.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={b.approved}
                          onChange={() => toggleApproveBullet(b.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                          aria-label="Approve bullet change"
                        />
                        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                          <div>
                            <div className="text-xs font-medium text-slate-500">
                              Master Ground Truth
                              {parentRole
                                ? ` · ${parentRole.role} (${parentRole.company})`
                                : ""}
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-slate-700">
                              {b.originalBullet}
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-900">
                                Editable Tailored Bullet (
                                {b.approved
                                  ? "Approved for PDF"
                                  : "Unchecked - using original"}
                                )
                              </span>
                              <span className="text-slate-500">
                                {b.rationale}
                              </span>
                            </div>
                            <textarea
                              value={b.tailoredBullet}
                              onChange={(e) =>
                                updateTailoredBulletText(b.id, e.target.value)
                              }
                              rows={2}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                            {b.ungroundedWarning && (
                              <div className="mt-1.5 space-y-1.5">
                                <p className="flex items-start gap-1.5 text-xs font-bold text-red-700">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  <span>{b.ungroundedWarning}</span>
                                </p>
                                {bulletUnlistedSkills.map((unlisted) => {
                                  const key = normalizeSkillKey(unlisted);
                                  const w = pendingWeightBySkill[key] || 3;
                                  return (
                                    <div
                                      key={key}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                                    >
                                      <span className="text-slate-700">
                                        Confirm <strong>{unlisted}</strong> & add to Resume:
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <select
                                          value={w}
                                          onChange={(e) =>
                                            setPendingWeightBySkill((prev) => ({
                                              ...prev,
                                              [key]: clampSkillWeight(
                                                Number(e.target.value),
                                                3
                                              ),
                                            }))
                                          }
                                          aria-label={`Weight for ${unlisted}`}
                                          className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] tabular-nums"
                                        >
                                          {(
                                            [1, 2, 3, 4, 5] as SkillWeight[]
                                          ).map((lvl) => (
                                            <option key={lvl} value={lvl}>
                                              {
                                                SKILL_WEIGHT_RUBRIC[lvl]
                                                  .shortLabel
                                              }
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            confirmAndAddSkillToResume(
                                              unlisted,
                                              w
                                            )
                                          }
                                          className="rounded bg-blue-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 whitespace-nowrap cursor-pointer"
                                        >
                                          Confirm & Add
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}

      {/* TAB 2: 4-PILLAR COVER LETTER STUDIO */}
      {workspaceTab === "coverletter" && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  4-Pillar Cover Letter Studio
                </h2>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                  Business-Grade · Zero Cliches
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Customized for {activeApp.company} · {activeApp.role}. Under 300 words with 4 structured business pillars.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(workspace.coverLetter);
                  setCopiedLetter(true);
                  setTimeout(() => setCopiedLetter(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {copiedLetter ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy Letter
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadTailoredCoverLetterPdf}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5" /> Download Cover Letter (.pdf)
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {/* 4-Pillar Business Structure Reference */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">
                4 Required Cover Letter Pillars (Zero AI Cliches · Never Uses Em/En Dashes):
              </div>
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <strong>01. Why hire me:</strong> Clear value for {activeApp.company}&apos;s immediate priorities.
                </div>
                <div>
                  <strong>02. What I bring:</strong> Interview-ready skills and verified workflows.
                </div>
                <div>
                  <strong>03. Things I have done:</strong> Concrete, quantified proof from your Master Resume.
                </div>
                <div>
                  <strong>04. Fit in organization:</strong> Direct alignment with {activeApp.company}&apos;s mission and team execution.
                </div>
              </div>
            </div>

            {/* Applicant-Written vs AI-Created Action Controls */}
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3.5 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <label className="block text-xs font-medium text-slate-700">
                  Optional Note for Organization Fit (Used by AI or Local Draft)
                </label>
                <input
                  type="text"
                  value={orgFitNote}
                  onChange={(e) =>
                    setOrgFitNote(sanitizeDashes(e.target.value))
                  }
                  placeholder={`Why ${activeApp.company}'s product, mission, or engineering culture fits how you work...`}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-end gap-2 lg:col-span-6 lg:justify-end">
                <button
                  type="button"
                  disabled={isGeneratingLetter}
                  onClick={handleGenerateAiCoverLetterOnly}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isGeneratingLetter
                    ? "Drafting..."
                    : "AI Create 4-Pillar Letter"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateLocalFourPillarLetter}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                >
                  4-Pillar Local Draft
                </button>
                <button
                  type="button"
                  onClick={handleInsertApplicantOutline}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  Write Myself (4-Pillar Outline)
                </button>
                {masterResume.defaultCoverLetter?.trim() && (
                  <button
                    type="button"
                    onClick={() =>
                      updateCoverLetter(
                        masterResume.defaultCoverLetter || ""
                      )
                    }
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                  >
                    Load Master Letter
                  </button>
                )}
              </div>
            </div>

            {(clWords > 300 || clBanned.length > 0 || clHasLongDash) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                <span>
                  Honesty &amp; Anti-Trope Check:{" "}
                  {clWords > 300
                    ? `Exceeds 300-word limit (${clWords} words). `
                    : ""}
                  {clBanned.length > 0
                    ? `Blocked AI tropes detected (${clBanned.join(", ")}). `
                    : ""}
                  {clHasLongDash ? "Long dashes detected." : ""}
                </span>
                {(clBanned.length > 0 || clHasLongDash) && (
                  <button
                    type="button"
                    onClick={() =>
                      updateCoverLetter(
                        scrubAiTropesAndDashes(workspace.coverLetter)
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 cursor-pointer"
                  >
                    <Wand2 className="h-3 w-3" /> Scrub AI Tropes &amp; Dashes
                  </button>
                )}
              </div>
            )}

            <textarea
              value={workspace.coverLetter}
              onChange={(e) => updateCoverLetter(e.target.value)}
              rows={12}
              placeholder="Write your cover letter directly here, click 'Write Myself (4-Pillar Outline)', or click 'AI Create 4-Pillar Letter'..."
              className="w-full rounded-lg border border-slate-200 p-3.5 text-sm leading-relaxed text-slate-800 focus:border-blue-600 focus:outline-none"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className={`font-mono text-xs tabular-nums ${
                  clWords > 300 ? "font-bold text-red-700" : "text-slate-500"
                }`}
              >
                Word count: {clWords} / 300 max · Zero AI tropes:{" "}
                {clBanned.length === 0 ? "Verified" : "Failed"} · Zero long dashes:{" "}
                {!clHasLongDash ? "Verified" : "Failed"}
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateCoverLetter(
                      scrubAiTropesAndDashes(workspace.coverLetter)
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Wand2 className="h-3.5 w-3.5 text-slate-500" />
                  Scrub AI Tropes
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      workspace.coverLetter
                    );
                    setCopiedLetter(true);
                    setTimeout(() => setCopiedLetter(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {copiedLetter ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy Letter
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTailoredCoverLetterPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Download Cover Letter (.pdf)
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: READER & ATS PREVIEWS */}
      {workspaceTab === "audit" && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Reader Previews &amp; ATS Inspection
              </h2>
              <p className="text-xs text-slate-500">
                Inspect how recruiters, hiring managers, and ATS parsers read your tailored resume for {activeApp.company}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setReaderTab("recruiter")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  readerTab === "recruiter"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Recruiter (6-Sec Skim)
              </button>
              <button
                type="button"
                onClick={() => setReaderTab("manager")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  readerTab === "manager"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Hiring Manager Proof
              </button>
              <button
                type="button"
                onClick={() => setReaderTab("screening")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  readerTab === "screening"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                ATS Plain Text
              </button>
            </div>
          </div>

          {/* Sub-tab 1: Recruiter 6-Second Skim */}
          {readerTab === "recruiter" && (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">
                  Candidate &amp; Positioned Headline
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {masterResume.contact.name || "Unlisted Name"}
                </div>
                <div className="text-xs text-slate-600">
                  {effectiveHeadline ||
                    masterResume.experience[0]?.role ||
                    "No current title"}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">
                  Top 5 Verified Skills
                </div>
                <div className="mt-1 text-xs font-medium text-slate-900">
                  {(workspace.requiredSkillsFound.length > 0
                    ? workspace.requiredSkillsFound
                    : masterResume.skills
                  )
                    .slice(0, 5)
                    .join(" · ") || "None listed"}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">
                  Experience &amp; Eligibility
                </div>
                <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900">
                  {masterResume.experience.length} Roles Logged
                </div>
                <div className="text-xs text-slate-600">
                  {[
                    masterResume.contact.securityClearance &&
                    masterResume.contact.securityClearance.toLowerCase() !==
                      "none"
                      ? masterResume.contact.securityClearance
                      : "",
                    masterResume.contact.workAuthorization || "",
                  ]
                    .filter(Boolean)
                    .join(" · ") ||
                    `Earliest: ${
                      masterResume.experience[
                        masterResume.experience.length - 1
                      ]?.startDate || "N/A"
                    }`}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">
                  Top-Third Skill Verification
                </div>
                <div className="mt-1 text-sm font-semibold text-emerald-700">
                  {workspace.requiredSkillsFound.length > 0
                    ? "Verified in Summary &amp; Skills"
                    : "Needs Skill Alignment"}
                </div>
                <div className="text-xs text-slate-600">
                  Visible above fold during 6-second skim
                </div>
              </div>
            </div>
          )}

          {/* Sub-tab 2: Hiring Manager Proof & Question Flags */}
          {readerTab === "manager" && (
            <div className="mt-5 space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  Quantified Results &amp; Proof Points
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-slate-700">
                  {workspace.bullets
                    .filter((b) => /\d/.test(b.tailoredBullet))
                    .map((b) => (
                      <li key={b.id}>{b.tailoredBullet}</li>
                    ))}
                  {workspace.bullets.filter((b) =>
                    /\d/.test(b.tailoredBullet)
                  ).length === 0 && (
                    <li className="text-amber-700">
                      Zero quantified impact bullets found. Add truthful metrics in Master Resume.
                    </li>
                  )}
                </ul>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold text-slate-900">
                  Hiring Manager Question Flags (Gaps, Stretch Topics, Stints)
                </h3>
                {workspace.managerFlags.length === 0 ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    Zero structural flags detected.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                    {workspace.managerFlags.map((flg, i) => (
                      <li key={i}>{flg}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Sub-tab 3: Screening System Plain Unformatted Text */}
          {readerTab === "screening" && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Single-column plain text ATS parsed output.
                </span>
                <button
                  type="button"
                  onClick={handleExportPlainText}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  Download Plain Text (.txt)
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-5 font-mono text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
                {plainTextResume}
              </pre>
            </div>
          )}
        </section>
      )}

      {/* Clean Single-Column Resume View for PDF / Print Output */}
      <div className="hidden print-only space-y-4 text-black">
        <h1 className="text-2xl font-bold">{masterResume.contact.name}</h1>
        {effectiveHeadline.trim() && (
          <div className="text-sm font-semibold">{effectiveHeadline}</div>
        )}
        <div className="text-xs">
          {[
            masterResume.contact.email,
            masterResume.contact.phone,
            masterResume.contact.location,
            masterResume.contact.workAuthorization,
            masterResume.contact.securityClearance &&
            masterResume.contact.securityClearance.toLowerCase() !== "none"
              ? `Clearance: ${masterResume.contact.securityClearance}`
              : "",
            ...collectAllProfileUrls(masterResume.contact),
          ]
            .filter(Boolean)
            .join(" | ")}
        </div>
        <div>
          <h2 className="border-b border-black pb-1 text-xs font-bold uppercase">
            Professional Summary
          </h2>
          <p className="mt-1 text-xs">
            {summaryHonestyWarning
              ? masterResume.summary
              : effectiveSummary}
          </p>
        </div>
        <div>
          <h2 className="border-b border-black pb-1 text-xs font-bold uppercase">
            Core Skills &amp; Keywords
          </h2>
          <p className="mt-1 text-xs">
            {Array.from(
              new Set([
                ...masterResume.skills,
                ...workspace.confirmedSkills,
              ])
            ).join(", ")}
          </p>
        </div>
        <div>
          <h2 className="border-b border-black pb-1 text-xs font-bold uppercase">
            Work Experience
          </h2>
          {masterResume.experience.map((exp) => {
            const compTag = formatExperienceComplianceTag(exp);
            return (
              <div key={exp.id} className="mt-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span>
                    {[exp.role, exp.company, exp.location, compTag]
                      .filter(Boolean)
                      .join(" | ")}
                  </span>
                  <span>
                    {exp.startDate} - {exp.endDate}
                  </span>
                </div>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {exp.bullets.map((orig, idx) => {
                    const prop = workspace.bullets.find(
                      (b) =>
                        b.experienceId === exp.id &&
                        b.bulletIndex === idx
                    );
                    const txt =
                      prop && prop.approved && !prop.ungroundedWarning
                        ? prop.tailoredBullet
                        : orig;
                    return <li key={idx}>{txt}</li>;
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <div>
          <h2 className="border-b border-black pb-1 text-xs font-bold uppercase">
            Education
          </h2>
          {masterResume.education.map((ed) => (
            <div key={ed.id} className="mt-1 text-xs">
              <strong>{ed.degree}</strong>, {ed.institution} ({ed.year})
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Download & Export Options Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <strong>Download Center:</strong> Selectable-text PDFs pre-populate Workday, Greenhouse, Lever, and iCIMS portals cleanly.
          </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadTailoredResumePdf}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Download Tailored Resume (.pdf)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTailoredCoverLetterPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Download Cover Letter (.pdf)
                </button>
                <button
                  type="button"
                  onClick={handleExportPlainText}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  Plain Text (.txt)
                </button>
                <button
                  type="button"
                  onClick={handleExportPrintHtml}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  HTML (.html)
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5 text-slate-500" />
                  Print
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
