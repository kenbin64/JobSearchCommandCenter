import React, { useMemo, useRef, useState } from "react";
import {
  BrainstormConversionResult,
  EducationEntry,
  ExperienceEntry,
  MasterResume,
  PersonalProjectEntry,
  ResumeEvaluationReport,
  SkillWeight,
} from "../types";
import {
  KENNETH_BINGHAM_MASTER_RESUME,
  SKILL_WEIGHT_RUBRIC,
  autoFixMasterResumeForAutofill,
  buildLocalResumeEvaluation,
  clampSkillWeight,
  collectAllProfileUrls,
  convertBrainstormLocally,
  countWords,
  detectBannedPhrases,
  detectUnlistedSkillsInResumeContent,
  fixSingleAutofillField,
  formatAutofillCompatibleResumeText,
  formatExperienceComplianceTag,
  getSkillNote,
  getSkillWeight,
  normalizeSkillKey,
  parseResumeTextLocally,
  partitionAndSortSkillsByWeight,
  runScreeningSystemAudit,
  sanitizeDashes,
} from "../engine";
import { downloadCoverLetterPdf, downloadResumePdf } from "../pdfGenerator";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  FileDown,
  FileText,
  FileUp,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";

interface MasterResumeViewProps {
  resume: MasterResume;
  evaluation: ResumeEvaluationReport | null;
  onSaveEvaluation: (report: ResumeEvaluationReport) => void;
  onChange: (updated: MasterResume) => void;
  onLoadDemo?: () => void;
  onNavigateMatch?: () => void;
}

type ResumeWorkspaceMode = "builder" | "evaluator";

const CLEARANCE_PRESETS = [
  "None",
  "Public Trust",
  "Confidential",
  "Active Secret",
  "Active Top Secret (TS)",
  "Active TS/SCI",
  "TS/SCI w/ CI Polygraph",
  "TS/SCI w/ Full Scope Polygraph",
  "DOE Q Clearance",
  "DOE L Clearance",
  "Inactive / Clearance Eligible",
];

export const MasterResumeView: React.FC<MasterResumeViewProps> = ({
  resume,
  evaluation,
  onSaveEvaluation,
  onChange,
  onLoadDemo,
  onNavigateMatch,
}) => {
  const [workspaceMode, setWorkspaceMode] =
    useState<ResumeWorkspaceMode>("builder");

  // Upload & Paste Resume state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedResumeText, setPastedResumeText] = useState("");

  // Builder input state
  const [jobTitleInput, setJobTitleInput] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [skillInputWeight, setSkillInputWeight] = useState<SkillWeight>(3);
  const [unlistedWeightBySkill, setUnlistedWeightBySkill] = useState<
    Record<string, SkillWeight>
  >({});
  const [unlistedNoteBySkill, setUnlistedNoteBySkill] = useState<
    Record<string, string>
  >({});
  const [openSkillNoteKeys, setOpenSkillNoteKeys] = useState<
    Record<string, boolean>
  >({});
  const [keywordInput, setKeywordInput] = useState("");
  const [aiUsageInput, setAiUsageInput] = useState("");
  const [certInput, setCertInput] = useState("");
  const [accomplishmentInput, setAccomplishmentInput] = useState("");
  const [extraLinkInput, setExtraLinkInput] = useState("");

  // Freeflow Job Brainstorm -> Usable Resume Entry Converter state
  const [bsRawText, setBsRawText] = useState("");
  const [bsCompany, setBsCompany] = useState("");
  const [bsRole, setBsRole] = useState("");
  const [bsLocation, setBsLocation] = useState("");
  const [bsStartDate, setBsStartDate] = useState("");
  const [bsEndDate, setBsEndDate] = useState("");
  const [bsIsNda, setBsIsNda] = useState(false);
  const [bsIsClearance, setBsIsClearance] = useState(false);
  const [bsClearanceLevel, setBsClearanceLevel] = useState("");
  const [bsRedactionTerms, setBsRedactionTerms] = useState("");
  const [isConvertingBrainstorm, setIsConvertingBrainstorm] = useState(false);
  const [bsNotice, setBsNotice] = useState("");
  const [bsPreview, setBsPreview] =
    useState<BrainstormConversionResult | null>(null);
  const [bsMergeSkills, setBsMergeSkills] = useState(true);
  const [bsDefaultSkillWeight, setBsDefaultSkillWeight] =
    useState<SkillWeight>(3);
  const [bsMergeAccomplishments, setBsMergeAccomplishments] = useState(true);

  // Per-role brainstorm drawer toggle & loading state
  const [openRoleBrainstormId, setOpenRoleBrainstormId] = useState<
    string | null
  >(null);
  const [convertingRoleId, setConvertingRoleId] = useState<string | null>(null);
  const [roleRedactionByExp, setRoleRedactionByExp] = useState<
    Record<string, string>
  >({});

  // AI Resume Evaluator state
  const [targetRoleHint, setTargetRoleHint] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalNotice, setEvalNotice] = useState("");
  const [copiedAutofill, setCopiedAutofill] = useState(false);
  const [appliedReorder, setAppliedReorder] = useState(false);
  const [autoFixReport, setAutoFixReport] = useState<{
    count: number;
    fixes: string[];
  } | null>(null);

  const targetTitlesList = resume.targetJobTitles || [];
  const atsKeywordsList = resume.atsKeywords || [];
  const aiUsageList = resume.aiUsage || [];
  const projectsList = resume.projects || [];
  const accomplishmentsList = resume.accomplishments || [];
  const defaultCoverLetterText = resume.defaultCoverLetter || "";

  const auditChecks = useMemo(() => runScreeningSystemAudit(resume), [resume]);
  const passedCount = auditChecks.filter((c) => c.passed).length;

  const activeEvaluation = useMemo(
    () => evaluation || buildLocalResumeEvaluation(resume, targetRoleHint),
    [evaluation, resume, targetRoleHint]
  );

  const autofillFormattedText = useMemo(
    () => formatAutofillCompatibleResumeText(resume),
    [resume]
  );

  const coverLetterWordCount = useMemo(
    () => countWords(defaultCoverLetterText),
    [defaultCoverLetterText]
  );
  const coverLetterBanned = useMemo(
    () => detectBannedPhrases(defaultCoverLetterText),
    [defaultCoverLetterText]
  );

  const detectedUnlistedSkills = useMemo(
    () => detectUnlistedSkillsInResumeContent(resume),
    [resume]
  );

  const applyParsedResume = (parsed: MasterResume, sourceLabel: string) => {
    const cleanResume: MasterResume = {
      contact: {
        name: sanitizeDashes(parsed.contact?.name || resume.contact.name),
        email: sanitizeDashes(parsed.contact?.email || resume.contact.email),
        phone: sanitizeDashes(parsed.contact?.phone || resume.contact.phone),
        location: sanitizeDashes(
          parsed.contact?.location || resume.contact.location
        ),
        linkedinUrl: sanitizeDashes(
          parsed.contact?.linkedinUrl || resume.contact.linkedinUrl || ""
        ),
        githubUrl: sanitizeDashes(
          parsed.contact?.githubUrl || resume.contact.githubUrl || ""
        ),
        portfolioUrl: sanitizeDashes(
          parsed.contact?.portfolioUrl || resume.contact.portfolioUrl || ""
        ),
        substackUrl: sanitizeDashes(
          parsed.contact?.substackUrl || resume.contact.substackUrl || ""
        ),
        workAuthorization: sanitizeDashes(
          parsed.contact?.workAuthorization ||
            resume.contact.workAuthorization ||
            ""
        ),
        securityClearance: sanitizeDashes(
          parsed.contact?.securityClearance ||
            resume.contact.securityClearance ||
            ""
        ),
        workPreference: sanitizeDashes(
          parsed.contact?.workPreference || resume.contact.workPreference || ""
        ),
        links:
          Array.isArray(parsed.contact?.links) &&
          parsed.contact.links.length > 0
            ? parsed.contact.links.map((l) => sanitizeDashes(l))
            : resume.contact.links,
      },
      targetJobTitles:
        Array.isArray(parsed.targetJobTitles) &&
        parsed.targetJobTitles.length > 0
          ? Array.from(
              new Set(parsed.targetJobTitles.map((t) => sanitizeDashes(t)))
            )
          : targetTitlesList,
      summary: sanitizeDashes(parsed.summary || resume.summary),
      skills:
        Array.isArray(parsed.skills) && parsed.skills.length > 0
          ? Array.from(new Set(parsed.skills.map((s) => sanitizeDashes(s))))
          : resume.skills,
      skillWeights: {
        ...(resume.skillWeights || {}),
        ...(parsed.skillWeights || {}),
      },
      skillNotes: {
        ...(resume.skillNotes || {}),
        ...(parsed.skillNotes || {}),
      },
      includeWeightOneOnResume:
        typeof parsed.includeWeightOneOnResume === "boolean"
          ? parsed.includeWeightOneOnResume
          : resume.includeWeightOneOnResume !== false,
      atsKeywords:
        Array.isArray(parsed.atsKeywords) && parsed.atsKeywords.length > 0
          ? Array.from(
              new Set(parsed.atsKeywords.map((k) => sanitizeDashes(k)))
            )
          : atsKeywordsList,
      aiUsage:
        Array.isArray(parsed.aiUsage) && parsed.aiUsage.length > 0
          ? parsed.aiUsage.map((a) => sanitizeDashes(a))
          : aiUsageList,
      experience:
        Array.isArray(parsed.experience) && parsed.experience.length > 0
          ? parsed.experience.map((e, idx) => ({
              id: e.id || `exp_${Date.now()}_${idx}`,
              company: sanitizeDashes(e.company || ""),
              role: sanitizeDashes(e.role || ""),
              location: sanitizeDashes(e.location || ""),
              startDate: sanitizeDashes(e.startDate || ""),
              endDate: sanitizeDashes(e.endDate || ""),
              bullets:
                Array.isArray(e.bullets) && e.bullets.length > 0
                  ? e.bullets.map((b) => sanitizeDashes(b))
                  : [""],
              rawBrainstorm: sanitizeDashes(e.rawBrainstorm || ""),
              isConfidentialNda: Boolean(e.isConfidentialNda),
              isClearanceRestricted: Boolean(e.isClearanceRestricted),
              roleSecurityClearance: sanitizeDashes(
                e.roleSecurityClearance || ""
              ),
              confidentialityNote: sanitizeDashes(e.confidentialityNote || ""),
              includeComplianceTag:
                typeof e.includeComplianceTag === "boolean"
                  ? e.includeComplianceTag
                  : true,
            }))
          : resume.experience,
      projects:
        Array.isArray(parsed.projects) && parsed.projects.length > 0
          ? parsed.projects.map((p, idx) => ({
              id: p.id || `proj_${Date.now()}_${idx}`,
              name: sanitizeDashes(p.name || ""),
              url: sanitizeDashes(p.url || ""),
              techStack: sanitizeDashes(p.techStack || ""),
              description: sanitizeDashes(p.description || ""),
            }))
          : projectsList,
      education:
        Array.isArray(parsed.education) && parsed.education.length > 0
          ? parsed.education.map((ed, idx) => ({
              id: ed.id || `edu_${Date.now()}_${idx}`,
              institution: sanitizeDashes(ed.institution || ""),
              degree: sanitizeDashes(ed.degree || ""),
              year: sanitizeDashes(ed.year || ""),
            }))
          : resume.education,
      certifications:
        Array.isArray(parsed.certifications) && parsed.certifications.length > 0
          ? parsed.certifications.map((c) => sanitizeDashes(c))
          : resume.certifications,
      accomplishments:
        Array.isArray(parsed.accomplishments) &&
        parsed.accomplishments.length > 0
          ? parsed.accomplishments.map((a) => sanitizeDashes(a))
          : accomplishmentsList,
      defaultCoverLetter: sanitizeDashes(
        parsed.defaultCoverLetter || defaultCoverLetterText
      ),
    };

    onChange(cleanResume);
    const nextEval = buildLocalResumeEvaluation(cleanResume, targetRoleHint);
    onSaveEvaluation(nextEval);
    setUploadError("");
    setUploadStatus(
      `Imported ${cleanResume.experience.length} ${
        cleanResume.experience.length === 1 ? "role" : "roles"
      }, ${cleanResume.skills.length} skills, and ${
        cleanResume.projects.length
      } ${
        cleanResume.projects.length === 1 ? "project" : "projects"
      } from ${sourceLabel}. Review and refine any field below.`
    );
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const commaIdx = result.indexOf(",");
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });

  const handleUploadResumeFile = async (file: File) => {
    if (file.size > 9 * 1024 * 1024) {
      setUploadError(
        "File exceeds 9 MB limit. Please upload a smaller resume document."
      );
      return;
    }

    setIsUploadingResume(true);
    setUploadError("");
    setUploadStatus(`Reading ${file.name} and extracting ground-truth fields...`);

    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".json")) {
        const rawJson = await file.text();
        const parsedJson = JSON.parse(sanitizeDashes(rawJson));
        const targetObj = parsedJson.masterResume
          ? parsedJson.masterResume
          : parsedJson;
        applyParsedResume(targetObj as MasterResume, `${file.name} (JSON)`);
        setIsUploadingResume(false);
        return;
      }

      const isPlainText =
        lower.endsWith(".txt") ||
        lower.endsWith(".md") ||
        file.type === "text/plain";
      const rawText = isPlainText ? await file.text() : "";
      const base64Data = isPlainText ? "" : await fileToBase64(file);

      const resp = await fetch("/api/resume/parse-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64Data,
          rawText,
        }),
      });

      const data = await resp.json();

      if (resp.ok && data.masterResume) {
        applyParsedResume(
          data.masterResume as MasterResume,
          `${file.name} (${
            data.method === "gemini-ai"
              ? "Gemini 3.8 Flash verbatim extraction"
              : "structured import"
          })`
        );
      } else if (resp.ok && data.extractedText) {
        const localStructured = parseResumeTextLocally(data.extractedText);
        applyParsedResume(localStructured, `${file.name} (local parser)`);
      } else if (rawText.trim()) {
        const localStructured = parseResumeTextLocally(rawText);
        applyParsedResume(localStructured, `${file.name} (local parser)`);
      } else {
        setUploadError(
          data.error ||
            "Could not extract structured fields from that file. Try uploading a searchable PDF, .docx, .txt, or paste your resume text."
        );
        setUploadStatus("");
      }
    } catch {
      try {
        const fallbackText = await file.text();
        if (fallbackText && !fallbackText.startsWith("%PDF")) {
          const localStructured = parseResumeTextLocally(fallbackText);
          applyParsedResume(localStructured, `${file.name} (browser parser)`);
        } else {
          setUploadError(
            "Unable to parse binary document right now. Paste your resume text below to populate the builder immediately."
          );
          setUploadStatus("");
        }
      } catch {
        setUploadError("Could not read the selected file.");
        setUploadStatus("");
      }
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleParsePastedText = async () => {
    const cleanText = sanitizeDashes(pastedResumeText.trim());
    if (!cleanText) return;

    setIsUploadingResume(true);
    setUploadError("");
    setUploadStatus("Extracting structured sections from pasted resume text...");

    try {
      const resp = await fetch("/api/resume/parse-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "pasted_resume.txt",
          mimeType: "text/plain",
          rawText: cleanText,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.masterResume) {
        applyParsedResume(
          data.masterResume as MasterResume,
          "pasted resume text (Gemini 3.8 Flash)"
        );
      } else {
        const localStructured = parseResumeTextLocally(cleanText);
        applyParsedResume(localStructured, "pasted resume text (local parser)");
      }
      setShowPasteBox(false);
      setPastedResumeText("");
    } catch {
      const localStructured = parseResumeTextLocally(cleanText);
      applyParsedResume(localStructured, "pasted resume text (local parser)");
      setShowPasteBox(false);
      setPastedResumeText("");
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleExportMasterResumeJson = () => {
    const blob = new Blob([JSON.stringify(resume, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "master_resume.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildGroundedMasterCoverLetter = (): string => {
    const targetTitle =
      targetTitlesList[0] ||
      resume.experience[0]?.role ||
      "your open position";
    const sortedCore = partitionAndSortSkillsByWeight(resume).coreSkills;
    const topSkills =
      sortedCore.slice(0, 5).join(", ") ||
      resume.skills.slice(0, 5).join(", ") ||
      "relevant systems";
    const recentRole = resume.experience[0];
    const leadProof =
      recentRole?.bullets?.find((b) => b.trim().length > 0) ||
      resume.summary ||
      "delivering dependable, measurable outcomes";
    const projMention = projectsList[0]
      ? ` Outside my core roles, I built ${projectsList[0].name}${
          projectsList[0].url ? ` (${projectsList[0].url})` : ""
        } using ${projectsList[0].techStack || topSkills}.`
      : "";

    return sanitizeDashes(
      `Dear Hiring Team,\n\nI am applying for ${targetTitle} opportunities with your organization. My background centers on hands-on execution across ${topSkills}, grounded in verifiable production delivery.\n\n${
        recentRole
          ? `In my work as ${recentRole.role} at ${recentRole.company}, I focused on measurable outcomes: ${leadProof}`
          : leadProof
      }${projMention}\n\nThank you for reviewing my resume and application materials. I welcome a conversation about how my verified experience aligns with your team's priorities.\n\nSincerely,\n${
        resume.contact.name || "[Your Name]"
      }`
    );
  };

  const handleGenerateMasterCoverLetterDraft = () => {
    onChange({
      ...resume,
      defaultCoverLetter: buildGroundedMasterCoverLetter(),
    });
  };

  const handleDownloadCoverLetterPdfClick = () => {
    const body =
      defaultCoverLetterText.trim() || buildGroundedMasterCoverLetter();
    if (!defaultCoverLetterText.trim()) {
      onChange({ ...resume, defaultCoverLetter: body });
    }
    downloadCoverLetterPdf(resume, body, {
      targetRole: targetTitlesList[0] || undefined,
    });
  };

  const handleRunLocalEvaluation = () => {
    const report = buildLocalResumeEvaluation(resume, targetRoleHint);
    onSaveEvaluation(report);
    setAppliedReorder(false);
    setEvalNotice("Evaluated locally in browser (zero external transmission).");
  };

  const handleRunAiEvaluation = async () => {
    setIsEvaluating(true);
    setAppliedReorder(false);
    setEvalNotice(
      "Privacy Notice: Sending Master Resume to Gemini 3.8 Flash for ATS pre-fill & Hiring Manager priority evaluation..."
    );

    try {
      const resp = await fetch("/api/resume/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterResume: resume,
          targetRoleHint: sanitizeDashes(targetRoleHint.trim()),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        const localFallback = buildLocalResumeEvaluation(resume, targetRoleHint);
        onSaveEvaluation(localFallback);
        setEvalNotice(
          data.error ||
            "Gemini unavailable; generated deterministic ATS & Hiring-Manager report."
        );
        setIsEvaluating(false);
        return;
      }

      const report: ResumeEvaluationReport = {
        atsCompatibilityScore: Math.min(
          100,
          Math.max(0, Number(data.atsCompatibilityScore) || 0)
        ),
        hiringManagerReadabilityScore: Math.min(
          100,
          Math.max(0, Number(data.hiringManagerReadabilityScore) || 0)
        ),
        topFoldHeadline: sanitizeDashes(data.topFoldHeadline || ""),
        autofillFields: Array.isArray(data.autofillFields)
          ? data.autofillFields.map(
              (f: {
                field?: string;
                extractedValue?: string;
                status?: string;
                note?: string;
              }) => ({
                field: sanitizeDashes(f.field || ""),
                extractedValue: sanitizeDashes(f.extractedValue || ""),
                status:
                  f.status === "Clean" || f.status === "Warning"
                    ? f.status
                    : "Missing",
                note: sanitizeDashes(f.note || ""),
              })
            )
          : [],
        parserFixes: Array.isArray(data.parserFixes)
          ? data.parserFixes.map((s: string) => sanitizeDashes(s))
          : [],
        hiringManagerPriorities: Array.isArray(data.hiringManagerPriorities)
          ? data.hiringManagerPriorities.map((s: string) => sanitizeDashes(s))
          : [],
        reorderedExperience: Array.isArray(data.reorderedExperience)
          ? data.reorderedExperience.map(
              (r: {
                experienceId?: string;
                company?: string;
                role?: string;
                reorderedBullets?: string[];
                leadReason?: string;
              }) => ({
                experienceId: r.experienceId || "",
                company: sanitizeDashes(r.company || ""),
                role: sanitizeDashes(r.role || ""),
                reorderedBullets: Array.isArray(r.reorderedBullets)
                  ? r.reorderedBullets.map((b) => sanitizeDashes(b))
                  : [],
                leadReason: sanitizeDashes(r.leadReason || ""),
              })
            )
          : [],
        usedAiModel: true,
        evaluatedAt: new Date().toISOString(),
      };

      onSaveEvaluation(report);
      setEvalNotice(
        "AI Evaluation complete: ATS pre-fill mapping and Hiring Manager impact-first ordering ready."
      );
    } catch {
      const localFallback = buildLocalResumeEvaluation(resume, targetRoleHint);
      onSaveEvaluation(localFallback);
      setEvalNotice("Evaluated locally after network error.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleApplyImpactFirstOrder = () => {
    if (activeEvaluation.reorderedExperience.length === 0) return;
    const nextExp = resume.experience.map((exp) => {
      const match = activeEvaluation.reorderedExperience.find(
        (r) =>
          r.experienceId === exp.id ||
          (r.company.toLowerCase() === exp.company.toLowerCase() &&
            r.role.toLowerCase() === exp.role.toLowerCase())
      );
      if (match && match.reorderedBullets.length > 0) {
        return {
          ...exp,
          bullets: match.reorderedBullets,
        };
      }
      return exp;
    });
    onChange({ ...resume, experience: nextExp });
    setAppliedReorder(true);
    setTimeout(() => setAppliedReorder(false), 2500);
  };

  const handleAutoFixAllPreFillFields = () => {
    const { fixedResume, fixesApplied, fixedCount } =
      autoFixMasterResumeForAutofill(resume, targetRoleHint);
    onChange(fixedResume);
    const updatedEval = buildLocalResumeEvaluation(fixedResume, targetRoleHint);
    onSaveEvaluation(updatedEval);
    setAutoFixReport({
      count: fixedCount,
      fixes:
        fixesApplied.length > 0
          ? fixesApplied
          : [
              "Verified all pre-fill fields meet strict ATS and OptimHire standards.",
            ],
    });
    setEvalNotice(
      "Auto-fixed Master Resume for 100% Pre-Fill Compliance (Workday, Greenhouse, OptimHire & Handshake)."
    );
  };

  const handleQuickFixField = (fieldName: string) => {
    const { fixedResume, fixDescription } = fixSingleAutofillField(
      resume,
      fieldName
    );
    onChange(fixedResume);
    const updatedEval = buildLocalResumeEvaluation(fixedResume, targetRoleHint);
    onSaveEvaluation(updatedEval);
    setAutoFixReport({
      count: 1,
      fixes: [fixDescription],
    });
    setEvalNotice(`Fixed ${fieldName} for pre-fill compliance.`);
  };

  const handleLoadKennethBinghamResume = () => {
    onChange(KENNETH_BINGHAM_MASTER_RESUME);
    const updatedEval = buildLocalResumeEvaluation(
      KENNETH_BINGHAM_MASTER_RESUME,
      "Senior Full-Stack Developer"
    );
    onSaveEvaluation(updatedEval);
    setUploadStatus(
      "Loaded Kenneth W. Bingham's official master resume (15+ years, 17 roles, clearance & selected projects)."
    );
    setAutoFixReport(null);
  };

  const handleCopyAutofillText = async () => {
    await navigator.clipboard.writeText(autofillFormattedText);
    setCopiedAutofill(true);
    setTimeout(() => setCopiedAutofill(false), 2000);
  };

  const handleDownloadAutofillResume = () => {
    const c = resume.contact;
    const allUrls = collectAllProfileUrls(c);
    const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${c.name || "Resume"} - ATS Pre-Fill Compatible</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; max-width: 760px; margin: 32px auto; padding: 0 24px; line-height: 1.45; font-size: 10.5pt; }
  h1 { font-size: 18pt; margin: 0 0 2px 0; }
  .roles { font-weight: 700; color: #1e40af; font-size: 10.5pt; margin-bottom: 4px; }
  .meta { font-size: 9.5pt; color: #1f2937; margin-bottom: 14px; }
  h2 { font-size: 10.5pt; text-transform: uppercase; border-bottom: 1px solid #9ca3af; padding-bottom: 2px; margin: 14px 0 6px 0; }
  .job-block { margin-bottom: 10px; }
  .job-title { font-weight: 700; }
  .job-meta { font-size: 9.5pt; color: #374151; }
  ul { margin: 4px 0 8px 18px; padding: 0; }
  li { margin-bottom: 3px; }
</style>
</head>
<body>
  <h1>${c.name || "Candidate Name"}</h1>
  ${
    targetTitlesList.length > 0
      ? `<div class="roles">${targetTitlesList.join(" | ")}</div>`
      : ""
  }
  <div class="meta">
    <div>${[
      c.location,
      c.workAuthorization,
      c.securityClearance && c.securityClearance.toLowerCase() !== "none"
        ? `Clearance: ${c.securityClearance}`
        : "",
      c.workPreference,
    ]
      .filter(Boolean)
      .join(" | ")}</div>
    <div>${[c.phone, c.email].filter(Boolean).join(" | ")}</div>
    ${allUrls.length > 0 ? `<div>${allUrls.join(" | ")}</div>` : ""}
  </div>

  <h2>Professional Summary</h2>
  <p>${resume.summary}</p>

  <h2>Core Skills & Keywords</h2>
  ${(() => {
    const { coreSkills, basicSkills } = partitionAndSortSkillsByWeight(resume);
    const coreLine =
      coreSkills.length > 0
        ? `<p><strong>Skills:</strong> ${coreSkills.join(", ")}</p>`
        : "";
    const basicLine =
      basicSkills.length > 0 && resume.includeWeightOneOnResume !== false
        ? `<p><strong>Foundational Familiarity:</strong> ${basicSkills.join(
            ", "
          )}</p>`
        : "";
    return coreLine + basicLine;
  })()}
  ${
    atsKeywordsList.length > 0
      ? `<p><strong>Domain & Methodologies:</strong> ${atsKeywordsList.join(", ")}</p>`
      : ""
  }
  ${
    aiUsageList.length > 0
      ? `<h2>AI Fluency & Workflows</h2><ul>${aiUsageList
          .map((item) => `<li>${item}</li>`)
          .join("")}</ul>`
      : ""
  }

  <h2>Work Experience</h2>
  ${resume.experience
    .map((exp) => {
      const compTag = formatExperienceComplianceTag(exp);
      return `<div class="job-block">
    <div class="job-title">${exp.role}</div>
    <div class="job-meta">${[
      exp.company,
      exp.location,
      compTag,
      `${exp.startDate} - ${exp.endDate}`,
    ]
      .filter(Boolean)
      .join(" | ")}</div>
    <ul>${exp.bullets
      .filter((b) => b.trim())
      .map((b) => `<li>${b}</li>`)
      .join("")}</ul>
  </div>`;
    })
    .join("")}

  ${
    projectsList.length > 0
      ? `<h2>Personal Projects</h2>${projectsList
          .map(
            (p) => `<div class="job-block">
          <div class="job-title">${[p.name, p.techStack]
            .filter(Boolean)
            .join(" | ")}</div>
          ${p.url ? `<div class="job-meta">${p.url}</div>` : ""}
          ${p.description ? `<p>${p.description}</p>` : ""}
        </div>`
          )
          .join("")}`
      : ""
  }

  <h2>Education</h2>
  ${resume.education
    .map(
      (ed) =>
        `<div><strong>${ed.degree}</strong> | ${ed.institution} | ${ed.year}</div>`
    )
    .join("")}
  ${
    resume.certifications.length > 0
      ? `<h2>Certifications</h2><ul>${resume.certifications
          .map((cert) => `<li>${cert}</li>`)
          .join("")}</ul>`
      : ""
  }
  ${
    accomplishmentsList.length > 0
      ? `<h2>Key Accomplishments</h2><ul>${accomplishmentsList
          .map((acc) => `<li>${acc}</li>`)
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
    a.download = "ats_prefill_impact_first_resume.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateContact = (
    field: keyof MasterResume["contact"],
    value: string
  ) => {
    onChange({
      ...resume,
      contact: {
        ...resume.contact,
        [field]: sanitizeDashes(value),
      },
    });
  };

  const addExtraLink = () => {
    const clean = sanitizeDashes(extraLinkInput.trim());
    if (!clean) return;
    onChange({
      ...resume,
      contact: {
        ...resume.contact,
        links: [...resume.contact.links, clean],
      },
    });
    setExtraLinkInput("");
  };

  const updateExtraLink = (idx: number, val: string) => {
    onChange({
      ...resume,
      contact: {
        ...resume.contact,
        links: resume.contact.links.map((item, i) =>
          i === idx ? sanitizeDashes(val) : item
        ),
      },
    });
  };

  const removeExtraLink = (idx: number) => {
    onChange({
      ...resume,
      contact: {
        ...resume.contact,
        links: resume.contact.links.filter((_, i) => i !== idx),
      },
    });
  };

  const addJobTitle = () => {
    const items = jobTitleInput
      .split(",")
      .map((s) => sanitizeDashes(s.trim()))
      .filter(Boolean);
    if (items.length === 0) return;
    onChange({
      ...resume,
      targetJobTitles: Array.from(new Set([...targetTitlesList, ...items])),
    });
    setJobTitleInput("");
  };

  const updateJobTitleAt = (idx: number, val: string) => {
    onChange({
      ...resume,
      targetJobTitles: targetTitlesList.map((item, i) =>
        i === idx ? sanitizeDashes(val) : item
      ),
    });
  };

  const removeJobTitleAt = (idx: number) => {
    onChange({
      ...resume,
      targetJobTitles: targetTitlesList.filter((_, i) => i !== idx),
    });
  };

  const addSkill = () => {
    const items = skillInput
      .split(",")
      .map((s) => sanitizeDashes(s.trim()))
      .filter(Boolean);
    if (items.length === 0) return;

    const existingLower = new Set(
      resume.skills.map((s) => normalizeSkillKey(s))
    );
    const merged = [...resume.skills];
    const nextWeights: Record<string, SkillWeight> = {
      ...(resume.skillWeights || {}),
    };
    for (const item of items) {
      const key = normalizeSkillKey(item);
      if (!existingLower.has(key)) {
        existingLower.add(key);
        merged.push(item);
      }
      nextWeights[key] = skillInputWeight;
    }

    onChange({
      ...resume,
      skills: merged,
      skillWeights: nextWeights,
    });
    setSkillInput("");
  };

  const updateSkillAt = (idx: number, val: string) => {
    const prevSkill = resume.skills[idx] || "";
    const prevKey = normalizeSkillKey(prevSkill);
    const nextSkill = sanitizeDashes(val);
    const nextKey = normalizeSkillKey(nextSkill);

    const nextWeights: Record<string, SkillWeight> = {
      ...(resume.skillWeights || {}),
    };
    const nextNotes: Record<string, string> = {
      ...(resume.skillNotes || {}),
    };

    if (prevKey && nextKey && prevKey !== nextKey) {
      if (nextWeights[prevKey] !== undefined) {
        nextWeights[nextKey] = nextWeights[prevKey];
        delete nextWeights[prevKey];
      }
      if (nextNotes[prevKey] !== undefined) {
        nextNotes[nextKey] = nextNotes[prevKey];
        delete nextNotes[prevKey];
      }
    }

    onChange({
      ...resume,
      skills: resume.skills.map((item, i) => (i === idx ? nextSkill : item)),
      skillWeights: nextWeights,
      skillNotes: nextNotes,
    });
  };

  const updateSkillWeight = (skill: string, weight: SkillWeight) => {
    const key = normalizeSkillKey(skill);
    if (!key) return;
    onChange({
      ...resume,
      skillWeights: {
        ...(resume.skillWeights || {}),
        [key]: clampSkillWeight(weight, 3),
      },
    });
  };

  const updateSkillNote = (skill: string, note: string) => {
    const key = normalizeSkillKey(skill);
    if (!key) return;
    onChange({
      ...resume,
      skillNotes: {
        ...(resume.skillNotes || {}),
        [key]: sanitizeDashes(note),
      },
    });
  };

  const appendSkillNoteToLatestRole = (skill: string) => {
    const note = getSkillNote(resume, skill).trim();
    if (!note) return;
    const bulletText = sanitizeDashes(
      note.toLowerCase().includes(skill.toLowerCase())
        ? note
        : `Applied ${skill}: ${note}`
    );
    if (resume.experience.length === 0) {
      const entry: ExperienceEntry = {
        id: `exp_${Date.now()}`,
        company: "Recent Experience / Hands-On Project",
        role: targetTitlesList[0] || "Practitioner",
        location: resume.contact.location || "",
        startDate: "2024-01",
        endDate: "Present",
        bullets: [bulletText],
        includeComplianceTag: false,
      };
      onChange({
        ...resume,
        experience: [entry],
      });
      return;
    }

    const firstRole = resume.experience[0];
    const cleanBullets = firstRole.bullets.filter((b) => b.trim().length > 0);
    if (cleanBullets.includes(bulletText)) return;

    onChange({
      ...resume,
      experience: resume.experience.map((e, i) =>
        i === 0 ? { ...e, bullets: [...cleanBullets, bulletText] } : e
      ),
    });
  };

  const confirmAndAddUnlistedSkill = (skill: string) => {
    const clean = sanitizeDashes(skill.trim());
    const key = normalizeSkillKey(clean);
    if (!clean || !key) return;
    const chosenWeight = unlistedWeightBySkill[key] || 3;
    const chosenNote = sanitizeDashes(unlistedNoteBySkill[key] || "");
    const alreadyIn = resume.skills.some((s) => normalizeSkillKey(s) === key);
    const nextSkills = alreadyIn ? resume.skills : [...resume.skills, clean];
    const nextNotes = { ...(resume.skillNotes || {}) };
    if (chosenNote) {
      nextNotes[key] = chosenNote;
    }
    onChange({
      ...resume,
      skills: nextSkills,
      skillWeights: {
        ...(resume.skillWeights || {}),
        [key]: chosenWeight,
      },
      skillNotes: nextNotes,
    });
  };

  const removeSkillAt = (idx: number) => {
    const removed = resume.skills[idx] || "";
    const key = normalizeSkillKey(removed);
    const nextWeights = { ...(resume.skillWeights || {}) };
    const nextNotes = { ...(resume.skillNotes || {}) };
    if (key) {
      delete nextWeights[key];
      delete nextNotes[key];
    }
    onChange({
      ...resume,
      skills: resume.skills.filter((_, i) => i !== idx),
      skillWeights: nextWeights,
      skillNotes: nextNotes,
    });
  };

  const addKeywords = () => {
    const items = keywordInput
      .split(",")
      .map((s) => sanitizeDashes(s.trim()))
      .filter(Boolean);
    if (items.length === 0) return;
    onChange({
      ...resume,
      atsKeywords: Array.from(new Set([...atsKeywordsList, ...items])),
    });
    setKeywordInput("");
  };

  const updateKeywordAt = (idx: number, val: string) => {
    onChange({
      ...resume,
      atsKeywords: atsKeywordsList.map((item, i) =>
        i === idx ? sanitizeDashes(val) : item
      ),
    });
  };

  const removeKeywordAt = (idx: number) => {
    onChange({
      ...resume,
      atsKeywords: atsKeywordsList.filter((_, i) => i !== idx),
    });
  };

  const addAiUsage = () => {
    const clean = sanitizeDashes(aiUsageInput.trim());
    if (!clean) return;
    onChange({
      ...resume,
      aiUsage: [...aiUsageList, clean],
    });
    setAiUsageInput("");
  };

  const updateAiUsageAt = (idx: number, val: string) => {
    onChange({
      ...resume,
      aiUsage: aiUsageList.map((item, i) =>
        i === idx ? sanitizeDashes(val) : item
      ),
    });
  };

  const removeAiUsage = (idx: number) => {
    onChange({
      ...resume,
      aiUsage: aiUsageList.filter((_, i) => i !== idx),
    });
  };

  const addCertification = () => {
    const clean = sanitizeDashes(certInput.trim());
    if (!clean) return;
    onChange({
      ...resume,
      certifications: [...resume.certifications, clean],
    });
    setCertInput("");
  };

  const updateCertificationAt = (idx: number, val: string) => {
    onChange({
      ...resume,
      certifications: resume.certifications.map((item, i) =>
        i === idx ? sanitizeDashes(val) : item
      ),
    });
  };

  const removeCertification = (idx: number) => {
    onChange({
      ...resume,
      certifications: resume.certifications.filter((_, i) => i !== idx),
    });
  };

  const addAccomplishment = () => {
    const clean = sanitizeDashes(accomplishmentInput.trim());
    if (!clean) return;
    onChange({
      ...resume,
      accomplishments: [...accomplishmentsList, clean],
    });
    setAccomplishmentInput("");
  };

  const updateAccomplishmentAt = (idx: number, val: string) => {
    onChange({
      ...resume,
      accomplishments: accomplishmentsList.map((item, i) =>
        i === idx ? sanitizeDashes(val) : item
      ),
    });
  };

  const removeAccomplishment = (idx: number) => {
    onChange({
      ...resume,
      accomplishments: accomplishmentsList.filter((_, i) => i !== idx),
    });
  };

  const moveExperience = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= resume.experience.length) return;
    const copy = [...resume.experience];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    onChange({ ...resume, experience: copy });
  };

  const handleDownloadPlainTextFile = () => {
    const blob = new Blob([autofillFormattedText], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "master_resume_ats_plain_text.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const addExperience = () => {
    const entry: ExperienceEntry = {
      id: `exp_${Date.now()}`,
      company: "",
      role: "",
      location: "",
      startDate: "2023-01",
      endDate: "Present",
      bullets: [""],
      rawBrainstorm: "",
      isConfidentialNda: false,
      isClearanceRestricted: false,
      roleSecurityClearance: "",
      confidentialityNote: "",
      includeComplianceTag: true,
    };
    onChange({
      ...resume,
      experience: [entry, ...resume.experience],
    });
  };

  const runBrainstormConversionRequest = async (
    payload: {
      rawText: string;
      company?: string;
      role?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      isConfidentialNda?: boolean;
      isClearanceRestricted?: boolean;
      securityClearance?: string;
      redactionTerms?: string;
    },
    useAi: boolean
  ): Promise<BrainstormConversionResult> => {
    if (!useAi) {
      return convertBrainstormLocally(payload);
    }
    try {
      const resp = await fetch("/api/resume/convert-brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return convertBrainstormLocally(payload);
      }
      return {
        company: sanitizeDashes(data.company || payload.company || ""),
        role: sanitizeDashes(data.role || payload.role || ""),
        location: sanitizeDashes(data.location || payload.location || ""),
        startDate: sanitizeDashes(data.startDate || payload.startDate || "2023-01"),
        endDate: sanitizeDashes(data.endDate || payload.endDate || "Present"),
        bullets: Array.isArray(data.bullets)
          ? data.bullets.map((b: string) => sanitizeDashes(b)).filter(Boolean)
          : [],
        promotionSummary: sanitizeDashes(data.promotionSummary || ""),
        extractedSkills: Array.isArray(data.extractedSkills)
          ? data.extractedSkills.map((s: string) => sanitizeDashes(s))
          : [],
        extractedKeywords: Array.isArray(data.extractedKeywords)
          ? data.extractedKeywords.map((s: string) => sanitizeDashes(s))
          : [],
        extractedAccomplishments: Array.isArray(data.extractedAccomplishments)
          ? data.extractedAccomplishments.map((s: string) => sanitizeDashes(s))
          : [],
        confidentialityNote: sanitizeDashes(data.confidentialityNote || ""),
        complianceNotes: Array.isArray(data.complianceNotes)
          ? data.complianceNotes.map((s: string) => sanitizeDashes(s))
          : [],
        usedAiModel: true,
      };
    } catch {
      return convertBrainstormLocally(payload);
    }
  };

  const handleConvertStandaloneBrainstorm = async (useAi: boolean) => {
    if (!bsRawText.trim()) {
      setBsNotice("Type or paste your freeflow job brainstorm notes first.");
      return;
    }
    setIsConvertingBrainstorm(true);
    setBsNotice(
      useAi
        ? "Converting raw freeflow brainstorm into NDA/Clearance-safe resume bullets with Gemini 3.8 Flash..."
        : "Converting raw freeflow brainstorm locally in browser..."
    );

    const clearanceVal =
      bsClearanceLevel.trim() || resume.contact.securityClearance || "";
    const result = await runBrainstormConversionRequest(
      {
        rawText: bsRawText,
        company: bsCompany,
        role: bsRole,
        location: bsLocation,
        startDate: bsStartDate,
        endDate: bsEndDate,
        isConfidentialNda: bsIsNda,
        isClearanceRestricted: bsIsClearance,
        securityClearance: clearanceVal,
        redactionTerms: bsRedactionTerms,
      },
      useAi
    );
    setBsPreview(result);
    setBsNotice(
      result.usedAiModel
        ? "Converted with Gemini 3.8 Flash. Review bullets and compliance tags below, then click 'Add Converted Entry to Master Resume'."
        : "Converted locally into structured impact bullets. Review and click 'Add Converted Entry to Master Resume'."
    );
    setIsConvertingBrainstorm(false);
  };

  const handleCommitBrainstormEntry = () => {
    if (!bsPreview) return;
    const effectiveClearance = sanitizeDashes(
      bsClearanceLevel.trim() || ""
    );
    const newEntry: ExperienceEntry = {
      id: `exp_${Date.now()}`,
      company: sanitizeDashes(bsPreview.company || "Employer Name"),
      role: sanitizeDashes(bsPreview.role || "Role Title"),
      location: sanitizeDashes(bsPreview.location || ""),
      startDate: sanitizeDashes(bsPreview.startDate || "2023-01"),
      endDate: sanitizeDashes(bsPreview.endDate || "Present"),
      bullets:
        bsPreview.bullets.length > 0 ? bsPreview.bullets : [""],
      rawBrainstorm: sanitizeDashes(bsRawText),
      isConfidentialNda: bsIsNda,
      isClearanceRestricted: bsIsClearance || Boolean(effectiveClearance),
      roleSecurityClearance: effectiveClearance,
      confidentialityNote: sanitizeDashes(bsPreview.confidentialityNote || ""),
      includeComplianceTag:
        bsIsNda || bsIsClearance || Boolean(effectiveClearance),
    };

    const nextSkills = bsMergeSkills
      ? Array.from(new Set([...resume.skills, ...bsPreview.extractedSkills]))
      : resume.skills;
    const nextWeights: Record<string, SkillWeight> = {
      ...(resume.skillWeights || {}),
    };
    if (bsMergeSkills) {
      for (const sk of bsPreview.extractedSkills) {
        const key = normalizeSkillKey(sk);
        if (key && nextWeights[key] === undefined) {
          nextWeights[key] = bsDefaultSkillWeight;
        }
      }
    }
    const nextKeywords = bsMergeSkills
      ? Array.from(
          new Set([...atsKeywordsList, ...bsPreview.extractedKeywords])
        )
      : atsKeywordsList;
    const nextAccomplishments = bsMergeAccomplishments
      ? Array.from(
          new Set([
            ...accomplishmentsList,
            ...(bsPreview.promotionSummary ? [bsPreview.promotionSummary] : []),
            ...bsPreview.extractedAccomplishments,
          ])
        )
      : accomplishmentsList;

    const nextContactClearance =
      effectiveClearance && !resume.contact.securityClearance
        ? effectiveClearance
        : resume.contact.securityClearance || "";

    onChange({
      ...resume,
      contact: {
        ...resume.contact,
        securityClearance: nextContactClearance,
      },
      skills: nextSkills,
      skillWeights: nextWeights,
      atsKeywords: nextKeywords,
      accomplishments: nextAccomplishments,
      experience: [newEntry, ...resume.experience],
    });

    setBsPreview(null);
    setBsRawText("");
    setBsCompany("");
    setBsRole("");
    setBsLocation("");
    setBsStartDate("");
    setBsEndDate("");
    setBsRedactionTerms("");
    setBsNotice(
      `Added "${newEntry.role} at ${newEntry.company}" to Work History${
        bsMergeSkills && bsPreview.extractedSkills.length > 0
          ? ` and merged ${bsPreview.extractedSkills.length} verified skills`
          : ""
      }.`
    );
  };

  const handleConvertRoleBrainstorm = async (
    exp: ExperienceEntry,
    useAi: boolean
  ) => {
    const raw = (exp.rawBrainstorm || "").trim();
    if (!raw) return;
    setConvertingRoleId(exp.id);
    const result = await runBrainstormConversionRequest(
      {
        rawText: raw,
        company: exp.company,
        role: exp.role,
        location: exp.location,
        startDate: exp.startDate,
        endDate: exp.endDate,
        isConfidentialNda: exp.isConfidentialNda,
        isClearanceRestricted: exp.isClearanceRestricted,
        securityClearance:
          exp.roleSecurityClearance || resume.contact.securityClearance || "",
        redactionTerms: roleRedactionByExp[exp.id] || "",
      },
      useAi
    );

    const nextExperience = resume.experience.map((item) => {
      if (item.id !== exp.id) return item;
      return {
        ...item,
        company: item.company || result.company,
        role: item.role || result.role,
        location: item.location || result.location,
        startDate: item.startDate || result.startDate,
        endDate: item.endDate || result.endDate,
        bullets: result.bullets.length > 0 ? result.bullets : item.bullets,
        confidentialityNote:
          item.confidentialityNote || result.confidentialityNote,
      };
    });

    onChange({
      ...resume,
      skills: Array.from(new Set([...resume.skills, ...result.extractedSkills])),
      atsKeywords: Array.from(
        new Set([...atsKeywordsList, ...result.extractedKeywords])
      ),
      experience: nextExperience,
    });
    setConvertingRoleId(null);
  };

  const updateExperience = (
    expId: string,
    patch: Partial<ExperienceEntry>
  ) => {
    onChange({
      ...resume,
      experience: resume.experience.map((e) =>
        e.id === expId ? { ...e, ...patch } : e
      ),
    });
  };

  const removeExperience = (expId: string) => {
    onChange({
      ...resume,
      experience: resume.experience.filter((e) => e.id !== expId),
    });
  };

  const addProject = () => {
    const entry: PersonalProjectEntry = {
      id: `proj_${Date.now()}`,
      name: "",
      url: "",
      techStack: "",
      description: "",
    };
    onChange({
      ...resume,
      projects: [...projectsList, entry],
    });
  };

  const updateProject = (
    projId: string,
    patch: Partial<PersonalProjectEntry>
  ) => {
    onChange({
      ...resume,
      projects: projectsList.map((p) =>
        p.id === projId ? { ...p, ...patch } : p
      ),
    });
  };

  const removeProject = (projId: string) => {
    onChange({
      ...resume,
      projects: projectsList.filter((p) => p.id !== projId),
    });
  };

  const addEducation = () => {
    const edu: EducationEntry = {
      id: `edu_${Date.now()}`,
      institution: "",
      degree: "",
      year: "",
    };
    onChange({
      ...resume,
      education: [...resume.education, edu],
    });
  };

  const updateEducation = (
    eduId: string,
    patch: Partial<EducationEntry>
  ) => {
    onChange({
      ...resume,
      education: resume.education.map((ed) =>
        ed.id === eduId ? { ...ed, ...patch } : ed
      ),
    });
  };

  const removeEducation = (eduId: string) => {
    onChange({
      ...resume,
      education: resume.education.filter((ed) => ed.id !== eduId),
    });
  };

  const scrollToSection = (sectionId: string) => {
    setWorkspaceMode("builder");
    setTimeout(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 20);
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Master Resume Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,.html,.htm,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleUploadResumeFile(file);
            e.target.value = "";
          }
        }}
      />

      {/* Page Header & Direct Upload / Selectable-Text PDF Export Controls */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>
              Local ground-truth Master Resume · Selectable-text PDFs built for ATS pre-fill, Recruiter skim & Hiring Managers
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Master Resume & Cover Letter Builder
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload an existing resume (.pdf, .docx, .txt, .json) or complete the structured builder below to export ATS-prepopulating Resume and Cover Letter PDFs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isUploadingResume}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <FileUp className="h-3.5 w-3.5" />
            {isUploadingResume ? "Parsing Resume..." : "Upload Master Resume"}
          </button>
          <button
            type="button"
            onClick={() => downloadResumePdf(resume)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5" />
            Download Resume (.pdf)
          </button>
          <button
            type="button"
            onClick={handleDownloadCoverLetterPdfClick}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5 text-slate-500" />
            Download Cover Letter (.pdf)
          </button>
          {onNavigateMatch && (
            <button
              type="button"
              onClick={onNavigateMatch}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100 whitespace-nowrap cursor-pointer"
            >
              <span>Tailor to Job</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Mode Switcher: 01 Resume Builder & Upload vs 02 AI ATS & Hiring Manager Evaluator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setWorkspaceMode("builder")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              workspaceMode === "builder"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            01. Resume & Cover Letter Builder
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode("evaluator")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              workspaceMode === "evaluator"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            02. AI ATS Pre-Fill & Manager Evaluator (
            <span className="font-mono tabular-nums">
              {activeEvaluation.atsCompatibilityScore}/100
            </span>
            )
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAutoFixAllPreFillFields}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
            title="Auto-format contact info, dates, phone, URLs, and education fields for 100% pre-fill compliance"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Auto-Fix for 100% Pre-Fill
          </button>
          <button
            type="button"
            onClick={handleLoadKennethBinghamResume}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 transition cursor-pointer"
            title="Load Kenneth Bingham's full 15+ year resume with 17 roles, DoD clearance, and selected projects"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            Load Kenneth Bingham Official Resume
          </button>
          {onLoadDemo && !resume.contact.name && resume.experience.length === 0 && (
            <button
              type="button"
              onClick={onLoadDemo}
              className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
            >
              Or load sample Master Resume
            </button>
          )}
        </div>
      </div>

      {/* Auto-Fix Report Banner (Visible in Builder Mode) */}
      {workspaceMode === "builder" && autoFixReport && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Applied {autoFixReport.count} format fix(es) for 100% pre-fill compliance (Workday, Greenhouse, OptimHire &amp; Handshake):
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAutoFixReport(null)}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-emerald-900/90 text-xs">
            {autoFixReport.fixes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {workspaceMode === "builder" ? (
        <>
          {/* Upload Dropzone + Optional Paste Raw Text Panel */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) {
                  handleUploadResumeFile(dropped);
                }
              }}
              className={`flex flex-col items-start justify-between gap-4 rounded-xl border border-dashed p-5 transition-colors sm:flex-row sm:items-center ${
                isDraggingFile
                  ? "border-blue-600 bg-blue-50/50"
                  : "border-slate-300 bg-slate-50/70"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-blue-600">
                  <FileUp className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Upload Existing Master Resume (.pdf, .docx, .txt, .md, .json)
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    Drag and drop your resume file here, or click <strong>Choose Resume File</strong> to auto-populate Contact Info, LinkedIn/GitHub/Portfolio/Substack URLs, Skills, AI Usage, Work History, Projects, Education, Certifications, and Accomplishments.
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Privacy Notice: Extracts only verbatim facts from your file into local browser storage. Never invents skills or stores files externally.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isUploadingResume}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {isUploadingResume ? "Extracting..." : "Choose Resume File"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasteBox((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <ClipboardPaste className="h-3.5 w-3.5 text-slate-500" />
                  {showPasteBox ? "Hide Paste Box" : "Paste Text Instead"}
                </button>
              </div>
            </div>

            {uploadStatus && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{uploadStatus}</span>
              </div>
            )}

            {uploadError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{uploadError}</span>
              </div>
            )}

            {showPasteBox && (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-900">
                    Paste Raw Resume Text (from Word, Google Docs, or LinkedIn PDF)
                  </label>
                  <span className="text-xs text-slate-500">
                    Automatically separates Contact, URLs, Skills, Work History, Projects & Education
                  </span>
                </div>
                <textarea
                  value={pastedResumeText}
                  onChange={(e) => setPastedResumeText(e.target.value)}
                  rows={7}
                  placeholder="Paste your full resume text here..."
                  className="w-full rounded-lg border border-slate-200 p-3 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasteBox(false)}
                    className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!pastedResumeText.trim() || isUploadingResume}
                    onClick={handleParsePastedText}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                  >
                    {isUploadingResume
                      ? "Parsing..."
                      : "Parse into Resume Builder"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Quick Section Jump Strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
            <span className="font-semibold text-slate-900">Jump to:</span>
            <button
              type="button"
              onClick={() => scrollToSection("builder-contact")}
              className="text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
            >
              01 Contact & URLs
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => scrollToSection("builder-titles-summary")}
              className="text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
            >
              02 Job Titles & Summary
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => scrollToSection("builder-skills-ai")}
              className="text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
            >
              03 Skills, Keywords & AI ({resume.skills.length})
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => scrollToSection("builder-brainstorm")}
              className="font-medium text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
            >
              Freeflow Job Brainstorm
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => scrollToSection("builder-experience")}
              className="text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
            >
              04 Work History ({resume.experience.length})
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => scrollToSection("builder-projects")}
              className="text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
            >
              05 Personal Projects ({projectsList.length})
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => scrollToSection("builder-credentials")}
              className="text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
            >
              06 Education, Certs & Awards
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => scrollToSection("builder-cover-letter")}
              className="text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
            >
              07 Cover Letter PDF
            </button>
          </div>

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            {/* Left 8 cols: Full ATS, Recruiter & Hiring Manager Builder */}
            <div className="space-y-6 lg:col-span-8">
              {/* 01. Contact, Work Eligibility & Dedicated Profile URLs */}
              <section
                id="builder-contact"
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <h2 className="text-base font-semibold text-slate-900">
                  01. Contact, Eligibility & Profile URLs (ATS Pre-Fill Ready)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Dedicated inputs map directly into Workday, Greenhouse, Lever, and iCIMS pre-fill fields and render as clickable links in your exported PDF.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Full Name (First & Last)
                    </label>
                    <input
                      type="text"
                      value={resume.contact.name}
                      onChange={(e) => updateContact("name", e.target.value)}
                      placeholder="Ken Bingham"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={resume.contact.email}
                      onChange={(e) => updateContact("email", e.target.value)}
                      placeholder="name@example.com"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Phone Number (10-digit plain format)
                    </label>
                    <input
                      type="text"
                      value={resume.contact.phone}
                      onChange={(e) => updateContact("phone", e.target.value)}
                      placeholder="801-555-0144"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      City, State / Region
                    </label>
                    <input
                      type="text"
                      value={resume.contact.location}
                      onChange={(e) =>
                        updateContact("location", e.target.value)
                      }
                      placeholder="Salt Lake City, UT"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Work Authorization (Recruiter Screen)
                    </label>
                    <input
                      type="text"
                      value={resume.contact.workAuthorization || ""}
                      onChange={(e) =>
                        updateContact("workAuthorization", e.target.value)
                      }
                      placeholder="US Citizen (no sponsorship required)"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Security Clearance (Active, Public Trust, Secret, TS/SCI)
                    </label>
                    <input
                      type="text"
                      list="security-clearance-presets"
                      value={resume.contact.securityClearance || ""}
                      onChange={(e) =>
                        updateContact("securityClearance", e.target.value)
                      }
                      placeholder="Select or type (e.g. Active Secret, TS/SCI, Public Trust)"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <datalist id="security-clearance-presets">
                      {CLEARANCE_PRESETS.map((preset) => (
                        <option key={preset} value={preset} />
                      ))}
                    </datalist>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">
                      Work Arrangement / Relocation Preference
                    </label>
                    <input
                      type="text"
                      value={resume.contact.workPreference || ""}
                      onChange={(e) =>
                        updateContact("workPreference", e.target.value)
                      }
                      placeholder="Remote, Hybrid, or Onsite (Open to relocation)"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Dedicated LinkedIn, GitHub, Portfolio, Substack URLs */}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-semibold text-slate-900">
                    Dedicated Social, Code, Writing & Portfolio URLs
                  </h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        LinkedIn URL
                      </label>
                      <input
                        type="text"
                        value={resume.contact.linkedinUrl || ""}
                        onChange={(e) =>
                          updateContact("linkedinUrl", e.target.value)
                        }
                        placeholder="linkedin.com/in/yourprofile"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        GitHub URL
                      </label>
                      <input
                        type="text"
                        value={resume.contact.githubUrl || ""}
                        onChange={(e) =>
                          updateContact("githubUrl", e.target.value)
                        }
                        placeholder="github.com/yourusername"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Portfolio / Personal Website URL
                      </label>
                      <input
                        type="text"
                        value={resume.contact.portfolioUrl || ""}
                        onChange={(e) =>
                          updateContact("portfolioUrl", e.target.value)
                        }
                        placeholder="yourportfolio.com"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Substack / Technical Blog / Medium URL
                      </label>
                      <input
                        type="text"
                        value={resume.contact.substackUrl || ""}
                        onChange={(e) =>
                          updateContact("substackUrl", e.target.value)
                        }
                        placeholder="yourname.substack.com"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-700">
                      Other Social / Profile URLs (Kaggle, Google Scholar, Hugging Face, X, YouTube)
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        value={extraLinkInput}
                        onChange={(e) => setExtraLinkInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addExtraLink();
                          }
                        }}
                        placeholder="kaggle.com/username or scholar.google.com/..."
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono focus:border-blue-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={addExtraLink}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                      >
                        Add URL
                      </button>
                    </div>
                    {resume.contact.links.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {resume.contact.links.map((lnk, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={lnk}
                              onChange={(e) =>
                                updateExtraLink(idx, e.target.value)
                              }
                              aria-label={`Additional profile URL ${idx + 1}`}
                              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => removeExtraLink(idx)}
                              className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                              aria-label="Remove profile URL"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 02. Target Job Titles & Professional Summary */}
              <section
                id="builder-titles-summary"
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <h2 className="text-base font-semibold text-slate-900">
                  02. Target Job Titles & Professional Summary (6-Second Recruiter Anchor)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Placing your target role titles directly beneath your name lets recruiters confirm role-family alignment in the first two seconds.
                </p>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    Target Job Titles (comma-separated)
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      value={jobTitleInput}
                      onChange={(e) => setJobTitleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addJobTitle();
                        }
                      }}
                      placeholder="e.g. Senior Backend Engineer, Technical Program Manager"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addJobTitle}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      Add Titles
                    </button>
                  </div>
                  {targetTitlesList.length > 0 && (
                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {targetTitlesList.map((title, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-1"
                        >
                          <input
                            type="text"
                            value={title}
                            onChange={(e) =>
                              updateJobTitleAt(idx, e.target.value)
                            }
                            aria-label={`Target job title ${idx + 1}`}
                            className="w-full bg-transparent text-xs font-semibold text-blue-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeJobTitleAt(idx)}
                            title="Remove target job title"
                            className="shrink-0 text-xs font-semibold text-blue-500 hover:text-red-600 cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    Professional Summary (2 to 4 factual lines)
                  </label>
                  <textarea
                    value={resume.summary}
                    onChange={(e) =>
                      onChange({
                        ...resume,
                        summary: sanitizeDashes(e.target.value),
                      })
                    }
                    rows={3}
                    placeholder="Years of experience, core domain, primary tools, and verifiable business or technical outcomes..."
                    className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm leading-relaxed focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </section>

              {/* 03. Interview-Defensible Skills, ATS Keywords & AI Usage */}
              <section
                id="builder-skills-ai"
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <h2 className="text-base font-semibold text-slate-900">
                  03. Skills, ATS Domain Keywords & Practical AI Usage
                </h2>

                {/* Interview-Readiness Rule Callout */}
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-950">
                  <strong>Interview Readiness Rule:</strong> Put only skills, keywords, and AI workflows where questions can be readily answered during an interview. Every item printed on your resume is treated as fair game for live probing; keep unfamiliar or early-stage topics in the Match & Tailor <em>Learning Only</em> bucket instead.
                </div>

                {/* 1-5 Proficiency Weighting Rubric & PDF Visibility Toggle */}
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="font-semibold text-slate-900">
                      1-5 Skill Weighting Scale (Orders PDF Top-Fold & Rates Fit vs Job Seniority)
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={resume.includeWeightOneOnResume !== false}
                        onChange={(e) =>
                          onChange({
                            ...resume,
                            includeWeightOneOnResume: e.target.checked,
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                      />
                      <span>
                        Print Weight 1 under Foundational Familiarity on PDF
                      </span>
                    </label>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                    <span>
                      <strong className="font-mono tabular-nums text-amber-800">
                        1
                      </strong>{" "}
                      Basic / Name (add some experience)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      <strong className="font-mono tabular-nums text-slate-900">
                        2-3
                      </strong>{" "}
                      Some to Substantial experience
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      <strong className="font-mono tabular-nums text-blue-800">
                        4
                      </strong>{" "}
                      Strong production depth
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      <strong className="font-mono tabular-nums text-emerald-800">
                        5
                      </strong>{" "}
                      Expert mastery
                    </span>
                  </div>
                </div>

                {/* Unlisted Skills Detected in Work History / Personal Projects -> Confirm & Weight to Add */}
                {detectedUnlistedSkills.length > 0 && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40 p-3.5">
                    <div className="text-xs font-semibold text-slate-900">
                      Mentioned in Work History or Projects, Not Listed in Skills Yet ({detectedUnlistedSkills.length})
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      Confirm any skill you actually have experience with, choose its 1-5 weight, and add it to your Master Resume Skills list:
                    </p>
                    <div className="mt-2.5 space-y-2">
                      {detectedUnlistedSkills.map((cand) => {
                        const key = normalizeSkillKey(cand);
                        const w = unlistedWeightBySkill[key] || 3;
                        const noteVal = unlistedNoteBySkill[key] || "";
                        return (
                          <div
                            key={key}
                            className="rounded-lg border border-slate-200 bg-white p-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-900">
                                {cand}
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={w}
                                  onChange={(e) =>
                                    setUnlistedWeightBySkill((prev) => ({
                                      ...prev,
                                      [key]: clampSkillWeight(
                                        Number(e.target.value),
                                        3
                                      ),
                                    }))
                                  }
                                  aria-label={`Weight for ${cand}`}
                                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none"
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
                                  onClick={() => confirmAndAddUnlistedSkill(cand)}
                                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap cursor-pointer"
                                >
                                  <Check className="h-3 w-3" />
                                  Confirm & Add
                                </button>
                              </div>
                            </div>
                            {w === 1 && (
                              <input
                                type="text"
                                value={noteVal}
                                onChange={(e) =>
                                  setUnlistedNoteBySkill((prev) => ({
                                    ...prev,
                                  [key]: sanitizeDashes(e.target.value),
                                  }))
                                }
                                placeholder="Weight 1 (Basic / Name): Add some hands-on experience or context..."
                                className="mt-2 w-full rounded-md border border-amber-300 bg-amber-50/40 px-2.5 py-1 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Core Skills with 1-5 Weight & Weight-1 Add Experience Prompt */}
                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    Core Technical & Functional Skills (comma-separated, weighted 1-5)
                  </label>
                  <div className="mt-1 flex flex-wrap gap-2 sm:flex-nowrap">
                    <input
                      type="text"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="e.g. Python, SQL, Project Management, PostgreSQL, Docker"
                      className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <select
                      value={skillInputWeight}
                      onChange={(e) =>
                        setSkillInputWeight(
                          clampSkillWeight(Number(e.target.value), 3)
                        )
                      }
                      aria-label="New skill proficiency weight 1 to 5"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-xs tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none"
                    >
                      {([1, 2, 3, 4, 5] as SkillWeight[]).map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {SKILL_WEIGHT_RUBRIC[lvl].shortLabel}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addSkill}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Add Skills
                    </button>
                  </div>

                  {resume.skills.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-[11px] text-slate-500">
                        Edit any skill name or 1-5 proficiency weight directly. Weight 5 (Expert) prints first; Weight 1 prompts you to add hands-on experience:
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {resume.skills.map((skill, idx) => {
                          const key = normalizeSkillKey(skill);
                          const weight = getSkillWeight(resume, skill);
                          const note = getSkillNote(resume, skill);
                          const showNoteBox =
                            weight === 1 ||
                            Boolean(note) ||
                            Boolean(openSkillNoteKeys[key]);

                          return (
                            <div
                              key={idx}
                              className={`rounded-lg border p-2.5 transition-colors ${
                                weight === 1
                                  ? "border-amber-200 bg-amber-50/30"
                                  : "border-slate-200 bg-slate-50/70"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={skill}
                                  onChange={(e) =>
                                    updateSkillAt(idx, e.target.value)
                                  }
                                  aria-label={`Skill ${idx + 1}`}
                                  className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-900 focus:outline-none"
                                />
                                <select
                                  value={weight}
                                  onChange={(e) =>
                                    updateSkillWeight(
                                      skill,
                                      clampSkillWeight(
                                        Number(e.target.value),
                                        3
                                      )
                                    )
                                  }
                                  aria-label={`Proficiency weight for ${skill}`}
                                  className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none"
                                >
                                  {([1, 2, 3, 4, 5] as SkillWeight[]).map(
                                    (lvl) => (
                                      <option key={lvl} value={lvl}>
                                        {SKILL_WEIGHT_RUBRIC[lvl].shortLabel}
                                      </option>
                                    )
                                  )}
                                </select>
                                {weight > 1 && !showNoteBox && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenSkillNoteKeys((prev) => ({
                                        ...prev,
                                        [key]: true,
                                      }))
                                    }
                                    title="Add interview/experience context note"
                                    className="shrink-0 text-[11px] text-slate-500 hover:text-blue-600 cursor-pointer"
                                  >
                                    + Note
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeSkillAt(idx)}
                                  title="Remove skill"
                                  className="shrink-0 px-1 text-xs text-slate-400 hover:text-red-600 cursor-pointer"
                                >
                                  ×
                                </button>
                              </div>

                              {showNoteBox && (
                                <div className="mt-2 space-y-1.5 border-t border-slate-200/70 pt-2">
                                  <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span
                                      className={
                                        weight === 1
                                          ? "font-medium text-amber-900"
                                          : "text-slate-500"
                                      }
                                    >
                                      {weight === 1
                                        ? "1 · Basic / Name: Add some experience or project usage"
                                        : "Experience / interview context note"}
                                    </span>
                                    {note.trim() && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          appendSkillNoteToLatestRole(skill)
                                        }
                                        className="font-medium text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
                                      >
                                        + Add to Latest Role
                                      </button>
                                    )}
                                  </div>
                                  <input
                                    type="text"
                                    value={note}
                                    onChange={(e) =>
                                      updateSkillNote(skill, e.target.value)
                                    }
                                    placeholder={
                                      weight === 1
                                        ? `Where did you use ${skill}? Add lab, script, or team exposure...`
                                        : `Key benchmark or interview talking point for ${skill}...`
                                    }
                                    className="w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-500">
                      No interview-ready skills added yet.
                    </p>
                  )}
                </div>

                {/* ATS Keywords & Methodologies */}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    ATS Domain Keywords, Methodologies & Compliance Standards
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Include domain terminology recruiters search for (e.g. Agile Scrum, SDLC, SOC2, HIPAA, Supply Chain Optimization, P&L Management). Every keyword below is editable in place.
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addKeywords();
                        }
                      }}
                      placeholder="e.g. Agile Scrum, Distributed Systems, Cross-Functional Alignment"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addKeywords}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                    >
                      Add Keywords
                    </button>
                  </div>
                  {atsKeywordsList.length > 0 && (
                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {atsKeywordsList.map((kw, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 focus-within:border-blue-600"
                        >
                          <input
                            type="text"
                            value={kw}
                            onChange={(e) =>
                              updateKeywordAt(idx, e.target.value)
                            }
                            aria-label={`ATS keyword ${idx + 1}`}
                            className="w-full bg-transparent text-xs text-slate-800 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeKeywordAt(idx)}
                            title="Remove keyword"
                            className="shrink-0 text-xs text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Practical AI Usage & Workflows */}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    Practical AI Usage, LLM Tooling & Verification Workflows
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Hiring managers value specific, responsible AI usage (what tool/API you use, for what workflow, and how you verify accuracy). Click any entry below to edit it directly.
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={aiUsageInput}
                      onChange={(e) => setAiUsageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAiUsage();
                        }
                      }}
                      placeholder="e.g. Gemini API structured extraction with deterministic validation and unit test review"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addAiUsage}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                    >
                      Add AI Workflow
                    </button>
                  </div>
                  {aiUsageList.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      {aiUsageList.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="text"
                            value={item}
                            onChange={(e) =>
                              updateAiUsageAt(idx, e.target.value)
                            }
                            aria-label={`AI workflow ${idx + 1}`}
                            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeAiUsage(idx)}
                            className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Freeflow Job Brainstorm -> Usable Resume Entry Converter (NDA & Security Clearance Safe) */}
              <section
                id="builder-brainstorm"
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
                      <Lock className="h-3.5 w-3.5" />
                      <span>
                        Unstructured Raw Brainstorm · NDA & Security Clearance Safe
                      </span>
                    </div>
                    <h2 className="mt-1 text-base font-semibold text-slate-900">
                      Freeflow Job Brainstorm to Usable Resume Entry
                    </h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      Write freely in plain, non-listed paragraphs: what you did, tools/skills used, rough benchmarks, promotions, and day-to-day job duties without violating confidentiality agreements. Mark NDA or Security Clearance protections below and convert raw notes directly into structured resume entries.
                    </p>
                  </div>
                </div>

                {/* Optional Context Fields (or leave blank to infer from raw prose) */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Employer (or NDA descriptor)
                    </label>
                    <input
                      type="text"
                      value={bsCompany}
                      onChange={(e) => setBsCompany(e.target.value)}
                      placeholder="e.g. Northrop Grumman or Fortune 100 Client"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Role Title (or latest promoted title)
                    </label>
                    <input
                      type="text"
                      value={bsRole}
                      onChange={(e) => setBsRole(e.target.value)}
                      placeholder="e.g. Senior Systems Engineer"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Location
                    </label>
                    <input
                      type="text"
                      value={bsLocation}
                      onChange={(e) => setBsLocation(e.target.value)}
                      placeholder="e.g. Reston, VA"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Start
                      </label>
                      <input
                        type="text"
                        value={bsStartDate}
                        onChange={(e) => setBsStartDate(e.target.value)}
                        placeholder="2022-03"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs tabular-nums focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        End
                      </label>
                      <input
                        type="text"
                        value={bsEndDate}
                        onChange={(e) => setBsEndDate(e.target.value)}
                        placeholder="Present"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs tabular-nums focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* NDA / Confidentiality & Security Clearance Controls */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bsIsNda}
                        onChange={(e) => setBsIsNda(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                      />
                      <span>
                        <strong>Subject to Confidentiality Agreement (NDA)</strong>
                        <span className="block text-[11px] text-slate-500">
                          Generalizes client identities, unreleased products, and proprietary codenames into NDA-safe operational scope.
                        </span>
                      </span>
                    </label>

                    <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bsIsClearance}
                        onChange={(e) => setBsIsClearance(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                      />
                      <span>
                        <strong>Subject to Security Clearance Restrictions</strong>
                        <span className="block text-[11px] text-slate-500">
                          Frames job duties strictly at an unclassified, pre-publication-safe level focused on transferable skills.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Security Clearance Held / Used on This Role (Optional)
                      </label>
                      <input
                        type="text"
                        list="security-clearance-presets"
                        value={bsClearanceLevel}
                        onChange={(e) => setBsClearanceLevel(e.target.value)}
                        placeholder={
                          resume.contact.securityClearance ||
                          "e.g. Active Secret, TS/SCI, Public Trust"
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Protected Names / Codenames to Auto-Redact (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={bsRedactionTerms}
                        onChange={(e) => setBsRedactionTerms(e.target.value)}
                        placeholder="e.g. Project Aurora, Client XYZ, Site 4"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Freeflow Non-Listed Raw Text Dump */}
                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    Raw Freeflow Brainstorm (No bullets or formatting needed - dump duties, skills, benchmarks & promotions)
                  </label>
                  <textarea
                    value={bsRawText}
                    onChange={(e) => setBsRawText(e.target.value)}
                    rows={5}
                    placeholder="Example: Started in March 2022 as Systems Analyst and got promoted to Senior Systems Analyst in Jan 2024 after cutting weekly incident triage time from 9 hours down to 2.5 hours. Used Python, SQL, PostgreSQL, Splunk, and Linux daily to monitor 180+ production nodes at 99.98% uptime, trained 5 junior analysts, and coordinated cross-team patches without violating client NDAs..."
                    className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isConvertingBrainstorm}
                      onClick={() => handleConvertStandaloneBrainstorm(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {isConvertingBrainstorm
                        ? "Converting Brainstorm..."
                        : "Convert with Gemini AI"}
                    </button>
                    <button
                      type="button"
                      disabled={isConvertingBrainstorm}
                      onClick={() => handleConvertStandaloneBrainstorm(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      Convert Locally (Instant)
                    </button>
                  </div>
                  {bsNotice && (
                    <span className="text-xs text-slate-600">{bsNotice}</span>
                  )}
                </div>

                {/* Converted Usable Resume Entry Preview */}
                {bsPreview && (
                  <div className="mt-5 space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/70 pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          Converted Usable Resume Entry (Review & Edit Before Saving)
                        </h3>
                        <p className="text-xs text-slate-600">
                          Raw brainstorm prose was converted into impact-first bullets and interview-defensible skills. Your raw brainstorm notes are never printed on exported PDFs.
                        </p>
                      </div>
                    </div>

                    {bsPreview.complianceNotes.length > 0 && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        <div className="font-semibold">
                          NDA & Security Clearance Safeguards Verified:
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {bsPreview.complianceNotes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Company
                        </label>
                        <input
                          type="text"
                          value={bsPreview.company}
                          onChange={(e) =>
                            setBsPreview({
                              ...bsPreview,
                              company: sanitizeDashes(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Role Title
                        </label>
                        <input
                          type="text"
                          value={bsPreview.role}
                          onChange={(e) =>
                            setBsPreview({
                              ...bsPreview,
                              role: sanitizeDashes(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Location
                        </label>
                        <input
                          type="text"
                          value={bsPreview.location}
                          onChange={(e) =>
                            setBsPreview({
                              ...bsPreview,
                              location: sanitizeDashes(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Start (YYYY-MM)
                        </label>
                        <input
                          type="text"
                          value={bsPreview.startDate}
                          onChange={(e) =>
                            setBsPreview({
                              ...bsPreview,
                              startDate: sanitizeDashes(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          End Date
                        </label>
                        <input
                          type="text"
                          value={bsPreview.endDate}
                          onChange={(e) =>
                            setBsPreview({
                              ...bsPreview,
                              endDate: sanitizeDashes(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Converted Impact-First Resume Bullets (one per line)
                      </label>
                      <textarea
                        value={bsPreview.bullets.join("\n")}
                        onChange={(e) =>
                          setBsPreview({
                            ...bsPreview,
                            bullets: sanitizeDashes(e.target.value).split("\n"),
                          })
                        }
                        rows={Math.max(4, bsPreview.bullets.length + 1)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-900"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Confidentiality / Clearance Scope Tag (Editable)
                        </label>
                        <input
                          type="text"
                          value={bsPreview.confidentialityNote}
                          onChange={(e) =>
                            setBsPreview({
                              ...bsPreview,
                              confidentialityNote: sanitizeDashes(
                                e.target.value
                              ),
                            })
                          }
                          placeholder="e.g. Scope Generalized per NDA"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Promotion Highlight (Editable)
                        </label>
                        <input
                          type="text"
                          value={bsPreview.promotionSummary}
                          onChange={(e) =>
                            setBsPreview({
                              ...bsPreview,
                              promotionSummary: sanitizeDashes(e.target.value),
                            })
                          }
                          placeholder="Optional promotion highlight..."
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={bsMergeSkills}
                              onChange={(e) =>
                                setBsMergeSkills(e.target.checked)
                              }
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                            />
                            <strong>
                              Merge Extracted Skills & Keywords (Editable)
                            </strong>
                          </label>
                          <select
                            value={bsDefaultSkillWeight}
                            onChange={(e) =>
                              setBsDefaultSkillWeight(
                                clampSkillWeight(Number(e.target.value), 3)
                              )
                            }
                            aria-label="Default 1-5 weight for merged brainstorm skills"
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] tabular-nums text-slate-800"
                          >
                            {([1, 2, 3, 4, 5] as SkillWeight[]).map((lvl) => (
                              <option key={lvl} value={lvl}>
                                {SKILL_WEIGHT_RUBRIC[lvl].shortLabel}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500">
                            Skills (comma-separated)
                          </label>
                          <input
                            type="text"
                            value={bsPreview.extractedSkills.join(", ")}
                            onChange={(e) =>
                              setBsPreview({
                                ...bsPreview,
                                extractedSkills: e.target.value
                                  .split(",")
                                  .map((s) => sanitizeDashes(s.trim()))
                                  .filter(Boolean),
                              })
                            }
                            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500">
                            ATS Keywords (comma-separated)
                          </label>
                          <input
                            type="text"
                            value={bsPreview.extractedKeywords.join(", ")}
                            onChange={(e) =>
                              setBsPreview({
                                ...bsPreview,
                                extractedKeywords: e.target.value
                                  .split(",")
                                  .map((s) => sanitizeDashes(s.trim()))
                                  .filter(Boolean),
                              })
                            }
                            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bsMergeAccomplishments}
                            onChange={(e) =>
                              setBsMergeAccomplishments(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                          />
                          <strong>
                            Merge Key Accomplishments (Editable, one per line)
                          </strong>
                        </label>
                        <textarea
                          value={bsPreview.extractedAccomplishments.join("\n")}
                          onChange={(e) =>
                            setBsPreview({
                              ...bsPreview,
                              extractedAccomplishments: sanitizeDashes(
                                e.target.value
                              )
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          rows={3}
                          className="w-full rounded-md border border-slate-200 p-2 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setBsPreview(null)}
                        className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Discard Preview
                      </button>
                      <button
                        type="button"
                        onClick={handleCommitBrainstormEntry}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Add Converted Entry to Master Resume
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* 04. Work History */}
              <section
                id="builder-experience"
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      04. Work History (Impact-First Chronology, NDA & Clearance Ready)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Use uniform YYYY-MM dates across all roles (for example, 2023-02 to Present). Mark NDA or Security Clearance flags on any role and convert raw brainstorm notes into bullets anytime.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addExperience}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Work Role
                  </button>
                </div>

                <div className="mt-5 divide-y divide-slate-200">
                  {resume.experience.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="text-xs text-slate-600">
                        No work history added yet. Upload your existing resume, use the Freeflow Job Brainstorm Converter above, or add a role manually.
                      </p>
                      <button
                        type="button"
                        onClick={addExperience}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add First Work Role
                      </button>
                    </div>
                  ) : (
                    resume.experience.map((exp, expIdx) => {
                      const isBrainstormOpen = openRoleBrainstormId === exp.id;
                      const isConvertingThisRole = convertingRoleId === exp.id;
                      return (
                        <div key={exp.id} className="py-5 first:pt-0 last:pb-0">
                          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                            <span className="font-mono font-medium tabular-nums">
                              Role #{expIdx + 1}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={expIdx === 0}
                                onClick={() => moveExperience(expIdx, -1)}
                                className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                              >
                                <ArrowUp className="h-3 w-3" /> Up
                              </button>
                              <button
                                type="button"
                                disabled={expIdx === resume.experience.length - 1}
                                onClick={() => moveExperience(expIdx, 1)}
                                className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                              >
                                <ArrowDown className="h-3 w-3" /> Down
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-medium text-slate-700">
                                Company / Employer (or NDA-Safe Client Label)
                              </label>
                              <input
                                type="text"
                                value={exp.company}
                                onChange={(e) =>
                                  updateExperience(exp.id, {
                                    company: sanitizeDashes(e.target.value),
                                  })
                                }
                                placeholder="Employer Name"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700">
                                Job Title
                              </label>
                              <input
                                type="text"
                                value={exp.role}
                                onChange={(e) =>
                                  updateExperience(exp.id, {
                                    role: sanitizeDashes(e.target.value),
                                  })
                                }
                                placeholder="Role Title"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700">
                                Location
                              </label>
                              <input
                                type="text"
                                value={exp.location}
                                onChange={(e) =>
                                  updateExperience(exp.id, {
                                    location: sanitizeDashes(e.target.value),
                                  })
                                }
                                placeholder="Salt Lake City, UT"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-slate-700">
                                  Start (YYYY-MM)
                                </label>
                                <input
                                  type="text"
                                  value={exp.startDate}
                                  onChange={(e) =>
                                    updateExperience(exp.id, {
                                      startDate: sanitizeDashes(e.target.value),
                                    })
                                  }
                                  placeholder="2023-02"
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-700">
                                  End Date
                                </label>
                                <input
                                  type="text"
                                  value={exp.endDate}
                                  onChange={(e) =>
                                    updateExperience(exp.id, {
                                      endDate: sanitizeDashes(e.target.value),
                                    })
                                  }
                                  placeholder="Present"
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Per-Role Confidentiality Agreement (NDA) & Security Clearance Controls */}
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(exp.isConfidentialNda)}
                                    onChange={(e) =>
                                      updateExperience(exp.id, {
                                        isConfidentialNda: e.target.checked,
                                      })
                                    }
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                                  />
                                  <span>Subject to Confidentiality Agreement (NDA)</span>
                                </label>

                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(exp.isClearanceRestricted)}
                                    onChange={(e) =>
                                      updateExperience(exp.id, {
                                        isClearanceRestricted: e.target.checked,
                                      })
                                    }
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                                  />
                                  <span>Subject to Security Clearance</span>
                                </label>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setOpenRoleBrainstormId((prev) =>
                                    prev === exp.id ? null : exp.id
                                  )
                                }
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                {isBrainstormOpen
                                  ? "Hide Role Freeflow Brainstorm"
                                  : "Brainstorm Raw Job Duties -> Bullets"}
                              </button>
                            </div>

                            {(exp.isConfidentialNda ||
                              exp.isClearanceRestricted ||
                              Boolean(exp.roleSecurityClearance)) && (
                              <div className="mt-2.5 grid grid-cols-1 gap-2.5 border-t border-slate-200 pt-2.5 sm:grid-cols-12">
                                <div className="sm:col-span-5">
                                  <label className="block text-[11px] font-medium text-slate-600">
                                    Role Security Clearance Level
                                  </label>
                                  <input
                                    type="text"
                                    list="security-clearance-presets"
                                    value={exp.roleSecurityClearance || ""}
                                    onChange={(e) =>
                                      updateExperience(exp.id, {
                                        roleSecurityClearance: sanitizeDashes(
                                          e.target.value
                                        ),
                                      })
                                    }
                                    placeholder="e.g. Active Secret, TS/SCI, Public Trust"
                                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                                  />
                                </div>
                                <div className="sm:col-span-5">
                                  <label className="block text-[11px] font-medium text-slate-600">
                                    Resume NDA / Clearance Scope Note
                                  </label>
                                  <input
                                    type="text"
                                    value={exp.confidentialityNote || ""}
                                    onChange={(e) =>
                                      updateExperience(exp.id, {
                                        confidentialityNote: sanitizeDashes(
                                          e.target.value
                                        ),
                                      })
                                    }
                                    placeholder="Scope Generalized per NDA"
                                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                                  />
                                </div>
                                <div className="flex items-end sm:col-span-2">
                                  <label className="inline-flex items-center gap-1.5 pb-1 text-[11px] text-slate-700 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={exp.includeComplianceTag !== false}
                                      onChange={(e) =>
                                        updateExperience(exp.id, {
                                          includeComplianceTag: e.target.checked,
                                        })
                                      }
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                                    />
                                    <span>Print tag</span>
                                  </label>
                                </div>
                              </div>
                            )}

                            {/* Per-Role Collapsible Freeflow Brainstorm Drawer */}
                            {isBrainstormOpen && (
                              <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <label className="text-xs font-semibold text-slate-900">
                                    Freeflow Raw Notes for {exp.role || "This Role"} (Private - Never Exported Raw)
                                  </label>
                                  <input
                                    type="text"
                                    value={roleRedactionByExp[exp.id] || ""}
                                    onChange={(e) =>
                                      setRoleRedactionByExp((prev) => ({
                                        ...prev,
                                        [exp.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Redact terms (comma-separated)"
                                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs sm:w-64"
                                  />
                                </div>
                                <textarea
                                  value={exp.rawBrainstorm || ""}
                                  onChange={(e) =>
                                    updateExperience(exp.id, {
                                      rawBrainstorm: sanitizeDashes(
                                        e.target.value
                                      ),
                                    })
                                  }
                                  rows={3}
                                  placeholder="Type raw non-listed stream of duties, tools used, benchmarks, and promotions for this role..."
                                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-relaxed"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      isConvertingThisRole ||
                                      !(exp.rawBrainstorm || "").trim()
                                    }
                                    onClick={() =>
                                      handleConvertRoleBrainstorm(exp, true)
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    {isConvertingThisRole
                                      ? "Converting..."
                                      : "Convert Raw Notes to Role Bullets (AI)"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      isConvertingThisRole ||
                                      !(exp.rawBrainstorm || "").trim()
                                    }
                                    onClick={() =>
                                      handleConvertRoleBrainstorm(exp, false)
                                    }
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                                  >
                                    Convert Locally
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-3">
                            <label className="block text-xs font-medium text-slate-700">
                              Impact Bullets (one per line: Action Verb + Scope + Quantified Result)
                            </label>
                            <textarea
                              value={exp.bullets.join("\n")}
                              onChange={(e) =>
                                updateExperience(exp.id, {
                                  bullets: sanitizeDashes(e.target.value).split(
                                    "\n"
                                  ),
                                })
                              }
                              rows={4}
                              placeholder="Reduced customer onboarding turnaround by 32% by standardizing intake validation."
                              className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs leading-relaxed"
                            />
                          </div>

                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeExperience(exp.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove Role
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* 05. Personal Projects & Live Project URLs */}
              <section
                id="builder-projects"
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      05. Personal Projects, Open Source & Live URLs
                    </h2>
                    <p className="text-xs text-slate-500">
                      Direct links to deployed apps, GitHub repos, case studies, or technical artifacts hiring managers can inspect immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addProject}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Project
                  </button>
                </div>

                <div className="mt-4 divide-y divide-slate-200">
                  {projectsList.length === 0 ? (
                    <p className="py-3 text-xs text-slate-500">
                      No personal projects added yet. Click "Add Project" to attach live demos or GitHub repositories.
                    </p>
                  ) : (
                    projectsList.map((proj) => (
                      <div key={proj.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700">
                              Project Name
                            </label>
                            <input
                              type="text"
                              value={proj.name}
                              onChange={(e) =>
                                updateProject(proj.id, {
                                  name: sanitizeDashes(e.target.value),
                                })
                              }
                              placeholder="Project or Tool Name"
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700">
                              Live URL or GitHub Repo Link
                            </label>
                            <input
                              type="text"
                              value={proj.url}
                              onChange={(e) =>
                                updateProject(proj.id, {
                                  url: sanitizeDashes(e.target.value),
                                })
                              }
                              placeholder="https://github.com/user/project"
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700">
                              Tools / Stack Used
                            </label>
                            <input
                              type="text"
                              value={proj.techStack}
                              onChange={(e) =>
                                updateProject(proj.id, {
                                  techStack: sanitizeDashes(e.target.value),
                                })
                              }
                              placeholder="TypeScript, PostgreSQL, Gemini API"
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                            />
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-start gap-2">
                          <textarea
                            value={proj.description}
                            onChange={(e) =>
                              updateProject(proj.id, {
                                description: sanitizeDashes(e.target.value),
                              })
                            }
                            rows={2}
                            placeholder="What problem it solves and measurable result or adoption..."
                            className="flex-1 rounded-lg border border-slate-200 p-2 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => removeProject(proj.id)}
                            className="mt-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label="Remove project"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* 06. Education, Certifications & Key Accomplishments */}
              <section
                id="builder-credentials"
                className="space-y-6 rounded-xl border border-slate-200 bg-white p-6"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        06. Education, Certifications & Key Accomplishments
                      </h2>
                      <p className="text-xs text-slate-500">
                        Academic degrees, active credentials, awards, publications, and career highlights.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addEducation}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Education
                    </button>
                  </div>

                  <div className="mt-4 divide-y divide-slate-200">
                    {resume.education.length === 0 ? (
                      <p className="py-2 text-xs text-slate-500">
                        No education entries added yet.
                      </p>
                    ) : (
                      resume.education.map((edu) => (
                        <div
                          key={edu.id}
                          className="grid grid-cols-1 gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-12"
                        >
                          <input
                            type="text"
                            value={edu.institution}
                            onChange={(e) =>
                              updateEducation(edu.id, {
                                institution: sanitizeDashes(e.target.value),
                              })
                            }
                            placeholder="University or Institution"
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs sm:col-span-5"
                          />
                          <input
                            type="text"
                            value={edu.degree}
                            onChange={(e) =>
                              updateEducation(edu.id, {
                                degree: sanitizeDashes(e.target.value),
                              })
                            }
                            placeholder="Degree / Major"
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs sm:col-span-4"
                          />
                          <input
                            type="text"
                            value={edu.year}
                            onChange={(e) =>
                              updateEducation(edu.id, {
                                year: sanitizeDashes(e.target.value),
                              })
                            }
                            placeholder="2021"
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums sm:col-span-2"
                          />
                          <button
                            type="button"
                            onClick={() => removeEducation(edu.id)}
                            className="inline-flex items-center justify-center text-slate-400 hover:text-red-600 sm:col-span-1 cursor-pointer"
                            aria-label="Remove education"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Certifications */}
                <div className="border-t border-slate-100 pt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    Certifications & Active Licenses
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={certInput}
                      onChange={(e) => setCertInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCertification();
                        }
                      }}
                      placeholder="e.g. PMP Certified (2024), AWS Solutions Architect - Associate"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addCertification}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                    >
                      Add Certification
                    </button>
                  </div>
                  {resume.certifications.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      {resume.certifications.map((cert, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="text"
                            value={cert}
                            onChange={(e) =>
                              updateCertificationAt(idx, e.target.value)
                            }
                            aria-label={`Certification ${idx + 1}`}
                            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeCertification(idx)}
                            className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Key Accomplishments */}
                <div className="border-t border-slate-100 pt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    Key Accomplishments, Publications, Patents & Awards
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={accomplishmentInput}
                      onChange={(e) => setAccomplishmentInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAccomplishment();
                        }
                      }}
                      placeholder="e.g. Delivered $1.2M annual cost reduction across regional operations"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addAccomplishment}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                    >
                      Add Accomplishment
                    </button>
                  </div>
                  {accomplishmentsList.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      {accomplishmentsList.map((acc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="text"
                            value={acc}
                            onChange={(e) =>
                              updateAccomplishmentAt(idx, e.target.value)
                            }
                            aria-label={`Key accomplishment ${idx + 1}`}
                            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeAccomplishment(idx)}
                            className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* 07. Master Cover Letter & Selectable-Text PDF Export */}
              <section
                id="builder-cover-letter"
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      07. Master Cover Letter & PDF Export
                    </h2>
                    <p className="text-xs text-slate-500">
                      Keep a clean, truthful baseline cover letter under 300 words ready for PDF upload, or tailor role-specific letters in Match & Tailor.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateMasterCoverLetterDraft}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Draft from Master Resume
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadCoverLetterPdfClick}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Download Cover Letter PDF
                    </button>
                  </div>
                </div>

                <textarea
                  value={defaultCoverLetterText}
                  onChange={(e) =>
                    onChange({
                      ...resume,
                      defaultCoverLetter: sanitizeDashes(e.target.value),
                    })
                  }
                  rows={7}
                  placeholder="Click 'Draft from Master Resume' above or write your concise baseline cover letter here..."
                  className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-xs leading-relaxed focus:border-blue-600 focus:outline-none"
                />

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-mono tabular-nums ${
                      coverLetterWordCount > 300
                        ? "font-semibold text-red-700"
                        : "text-slate-500"
                    }`}
                  >
                    Word count: {coverLetterWordCount} / 300 max
                  </span>
                  {coverLetterBanned.length > 0 && (
                    <span className="font-semibold text-red-700">
                      Remove cliché phrases: {coverLetterBanned.join(", ")}
                    </span>
                  )}
                </div>
              </section>
            </div>

            {/* Right 4 cols: Live Readiness + PDF Downloads + Screening Lint */}
            <aside className="space-y-6 lg:sticky lg:top-20 lg:col-span-4">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-base font-semibold text-slate-900">
                  Download Center (Resume & Cover Letter)
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Generates true selectable-text vector PDFs (standard Helvetica, single-column reading order, clickable URLs) for 1:1 portal pre-population.
                </p>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-slate-500">ATS Pre-Fill</dt>
                    <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-900">
                      {activeEvaluation.atsCompatibilityScore}%
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-slate-500">Manager Skim</dt>
                    <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-blue-700">
                      {activeEvaluation.hiringManagerReadabilityScore}%
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-slate-500">Skills + AI</dt>
                    <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-900">
                      {resume.skills.length + aiUsageList.length}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-slate-500">Roles + Projects</dt>
                    <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-900">
                      {resume.experience.length + projectsList.length}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => downloadResumePdf(resume)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Download Master Resume (.pdf)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCoverLetterPdfClick}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    <FileDown className="h-3.5 w-3.5 text-slate-500" />
                    Download Cover Letter (.pdf)
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoFixAllPreFillFields}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition cursor-pointer"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Auto-Fix for 100% Pre-Fill Compliance
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceMode("evaluator")}
                    className="w-full rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Run AI ATS & Manager Evaluator
                  </button>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadPlainTextFile}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" /> .txt
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadAutofillResume}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" /> .html
                    </button>
                    <button
                      type="button"
                      onClick={handleExportMasterResumeJson}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" /> .json
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyAutofillText}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    {copiedAutofill ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied Plain Text to Clipboard
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-500" /> Copy Plain Text to Clipboard
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    Screening-System Lint
                  </h2>
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-700">
                    {passedCount}/{auditChecks.length} Passed
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Verifies single-column structure, canonical parser headings, plain-text contact blocks, and YYYY-MM date consistency.
                </p>

                <div className="mt-4 divide-y divide-slate-100">
                  {auditChecks.map((chk) => (
                    <div key={chk.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-2.5">
                        {chk.passed ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        )}
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            {chk.passed ? "PASS: " : "FLAG: "}
                            {chk.title}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">
                            {chk.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </>
      ) : (
        /* Mode 02: AI Resume Evaluator: ATS Pre-Fill Compatibility + Hiring Manager Priority */
        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                AI Resume Evaluator (ATS Form Pre-Fill & Hiring Manager Skim)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Tests how application uploaders parse your fields and reorders existing bullets so your top measurable outcomes appear first. Never invents claims.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={targetRoleHint}
                onChange={(e) => setTargetRoleHint(e.target.value)}
                placeholder="Target focus (e.g. Backend Engineer)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none sm:w-56"
              />
              <button
                type="button"
                onClick={handleRunLocalEvaluation}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                Run Local Audit
              </button>
              <button
                type="button"
                disabled={isEvaluating}
                onClick={handleRunAiEvaluation}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isEvaluating ? "animate-spin" : ""}`}
                />
                {isEvaluating ? "Evaluating..." : "Evaluate with Gemini AI"}
              </button>
            </div>
          </div>

          {evalNotice && (
            <div className="text-xs text-slate-600">{evalNotice}</div>
          )}

          {/* Dual Score Strip + Hiring Manager Top-Fold Headline */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-3">
              <div className="text-xs text-slate-500">
                ATS & Pre-Fill Compatibility
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {activeEvaluation.atsCompatibilityScore}
                <span className="text-xs font-normal text-slate-400">
                  {" "}
                  / 100
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Workday / Greenhouse field mapping
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-3">
              <div className="text-xs text-slate-500">
                Hiring Manager Impact Priority
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-blue-700">
                {activeEvaluation.hiringManagerReadabilityScore}
                <span className="text-xs font-normal text-slate-400">
                  {" "}
                  / 100
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-600">
                6-second top-fold proof density
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-6">
              <div className="text-xs text-slate-500">
                Recommended Top-Fold Hiring Manager Positioning Line
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {activeEvaluation.topFoldHeadline}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Foregrounds role identity and core verified stack immediately below your contact header.
              </div>
            </div>
          </div>

          {/* Two-Column Diagnostic */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Application Form Pre-Fill Simulator
                  </h3>
                  <p className="text-xs text-slate-500">
                    Simulates how Workday, Greenhouse, Lever, Ashby, and OptimHire split and prefill your fields.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAutoFixAllPreFillFields}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer shrink-0"
                  title="Auto-format contact info, dates, phone, URLs, and education fields for 100% pre-fill compliance"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Auto-Fix Master Resume for Pre-Fill
                </button>
              </div>

              {autoFixReport && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      Applied {autoFixReport.count} format fix(es) for 100% pre-fill compliance:
                    </span>
                  </div>
                  <ul className="mt-1.5 list-disc pl-5 space-y-0.5 text-emerald-900/90 text-[11px]">
                    {autoFixReport.fixes.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Form Input Field</th>
                      <th className="px-3 py-2.5">Parsed Value</th>
                      <th className="px-3 py-2.5">Status & Quick Fix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeEvaluation.autofillFields.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                          {row.field}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          <div>{row.extractedValue || "Not detected"}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {row.note}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold ${
                                row.status === "Clean"
                                  ? "text-emerald-700"
                                  : row.status === "Warning"
                                  ? "text-amber-700"
                                  : "text-red-700"
                              }`}
                            >
                              {row.status}
                            </span>
                            {row.status !== "Clean" && (
                              <button
                                type="button"
                                onClick={() => handleQuickFixField(row.field)}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 px-2 py-0.5 text-[11px] font-medium transition cursor-pointer"
                                title={`Auto-fix ${row.field} to standard pre-fill format`}
                              >
                                <Wand2 className="h-3 w-3 text-blue-600" />
                                Fix
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  What Hiring Managers Scan First
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-700">
                  {activeEvaluation.hiringManagerPriorities.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {activeEvaluation.reorderedExperience.length > 0 && (
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-900">
                        Impact-First Bullet Priority Preview
                      </h4>
                      <p className="text-xs text-slate-500">
                        Promotes your strongest verified metric to Bullet #1 of each role.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyImpactFirstOrder}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {appliedReorder ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Applied
                        </>
                      ) : (
                        <>
                          <ArrowUp className="h-3.5 w-3.5" /> Apply Impact-First Order
                        </>
                      )}
                    </button>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {activeEvaluation.reorderedExperience.map((rolePri, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                      >
                        <div className="font-semibold text-slate-900">
                          {rolePri.role || "Role"} · {rolePri.company || "Company"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-blue-700">
                          {rolePri.leadReason}
                        </div>
                        {rolePri.reorderedBullets[0] && (
                          <p className="mt-1.5 text-slate-700">
                            <strong>Lead Bullet #1:</strong>{" "}
                            {rolePri.reorderedBullets[0]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="text-xs text-slate-600">
              <strong>ATS Pre-Fill Ready Exports:</strong> Native selectable-text PDF, HTML, or plain text with single-column chronology.
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleCopyAutofillText}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {copiedAutofill ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied ATS Text
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-500" /> Copy Plain Text
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadAutofillResume}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Download HTML
              </button>
              <button
                type="button"
                onClick={() => downloadResumePdf(resume)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5" />
                Download ATS Resume (.pdf)
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
