import { jsPDF } from "jspdf";
import {
  ApplicationRecord,
  MasterResume,
  TailoredWorkspace,
} from "./types";
import {
  collectAllProfileUrls,
  formatExperienceComplianceTag,
  partitionAndSortSkillsByWeight,
  sanitizeDashes,
  todayIsoDate,
} from "./engine";

function ensureHttpUrl(raw: string): string {
  const clean = raw.trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  // Strip label prefix like "LinkedIn: " if present
  const withoutLabel = clean.includes(": ")
    ? clean.split(": ").slice(1).join(": ").trim()
    : clean;
  return `https://${withoutLabel}`;
}

export interface ResumePdfOptions {
  targetApp?: ApplicationRecord | null;
  workspace?: TailoredWorkspace | null;
  filename?: string;
}

export function downloadResumePdf(
  resume: MasterResume,
  options: ResumePdfOptions = {}
): void {
  const { targetApp, workspace, filename } = options;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 612pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 792pt
  const marginX = 46;
  const marginTop = 44;
  const marginBottom = 44;
  const maxWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const ensureSpace = (neededPt: number) => {
    if (y + neededPt > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const writeWrappedText = (
    text: string,
    fontSize: number,
    fontStyle: "normal" | "bold" = "normal",
    color: [number, number, number] = [17, 24, 39],
    indent = 0,
    lineHeightFactor = 1.38
  ) => {
    const clean = sanitizeDashes(text || "").trim();
    if (!clean) return;
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped: string[] = doc.splitTextToSize(clean, maxWidth - indent);
    const lineStep = fontSize * lineHeightFactor;
    for (const line of wrapped) {
      ensureSpace(lineStep);
      doc.text(line, marginX + indent, y);
      y += lineStep;
    }
  };

  const writeSectionHeading = (heading: string) => {
    y += 6;
    ensureSpace(26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(heading.toUpperCase(), marginX, y);
    y += 4;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 12;
  };

  const c = resume.contact;
  // 1. Candidate Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizeDashes(c.name || "Candidate Name"), marginX, y);
  y += 16;

  // 2. Target Role / Headline Line (Recruiter 6-second anchor)
  const customHeadline = sanitizeDashes(workspace?.tailoredHeadline || "").trim();
  const headlineTitles = customHeadline
    ? [customHeadline]
    : targetApp?.role
    ? [targetApp.role, ...(resume.targetJobTitles || []).slice(0, 1)]
    : resume.targetJobTitles || [];
  if (headlineTitles.length > 0) {
    writeWrappedText(
      Array.from(new Set(headlineTitles)).join(" | "),
      10.5,
      "bold",
      [30, 64, 175]
    );
    y += 2;
  }

  // 3. Plain-Text Contact, Security Clearance & Work Eligibility Block (1:1 ATS pre-fill friendly)
  const clearanceText =
    c.securityClearance && c.securityClearance.trim().toLowerCase() !== "none"
      ? `Clearance: ${c.securityClearance.trim()}`
      : "";
  const locAndAuth = [
    c.location,
    c.workAuthorization,
    clearanceText,
    c.workPreference,
  ]
    .map((s) => sanitizeDashes(s || "").trim())
    .filter(Boolean)
    .join(" | ");
  if (locAndAuth) {
    writeWrappedText(locAndAuth, 9.5, "normal", [51, 65, 85]);
  }

  const phoneEmail = [c.phone, c.email]
    .map((s) => sanitizeDashes(s || "").trim())
    .filter(Boolean)
    .join(" | ");
  if (phoneEmail) {
    writeWrappedText(phoneEmail, 9.5, "normal", [51, 65, 85]);
  }

  // 4. Clickable Profile URLs (LinkedIn, GitHub, Portfolio, Substack, extra links)
  const profileUrls = collectAllProfileUrls(c);
  if (profileUrls.length > 0) {
    ensureSpace(14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(37, 99, 235);
    let cursorX = marginX;
    profileUrls.forEach((rawUrl, idx) => {
      const cleanLabel = sanitizeDashes(rawUrl);
      const separator = idx < profileUrls.length - 1 ? "  |  " : "";
      const labelWidth = doc.getTextWidth(cleanLabel);
      const sepWidth = doc.getTextWidth(separator);
      if (cursorX + labelWidth > pageWidth - marginX && cursorX > marginX) {
        y += 12.5;
        ensureSpace(14);
        cursorX = marginX;
      }
      doc.textWithLink(cleanLabel, cursorX, y, {
        url: ensureHttpUrl(cleanLabel),
      });
      cursorX += labelWidth;
      if (separator) {
        doc.setTextColor(100, 116, 139);
        doc.text(separator, cursorX, y);
        doc.setTextColor(37, 99, 235);
        cursorX += sepWidth;
      }
    });
    y += 14;
  } else {
    y += 4;
  }

  // 5. Professional Summary
  const effectiveSummary = sanitizeDashes(
    workspace?.tailoredSummary?.trim() ? workspace.tailoredSummary : resume.summary
  ).trim();
  if (effectiveSummary) {
    writeSectionHeading("Professional Summary");
    writeWrappedText(effectiveSummary, 9.8, "normal", [17, 24, 39]);
  }

  // 6. Core Skills & Domain Keywords (Sorted by 1-5 Weight: Expert 5 first)
  const { coreSkills, basicSkills } = partitionAndSortSkillsByWeight(
    resume,
    workspace?.confirmedSkills || []
  );
  const showBasicLine =
    basicSkills.length > 0 && resume.includeWeightOneOnResume !== false;
  const domainKeywords = resume.atsKeywords || [];
  if (coreSkills.length > 0 || showBasicLine || domainKeywords.length > 0) {
    writeSectionHeading("Core Skills & Keywords");
    if (coreSkills.length > 0) {
      writeWrappedText(
        `Skills: ${coreSkills.join(", ")}`,
        9.6,
        "normal",
        [17, 24, 39]
      );
    }
    if (showBasicLine) {
      y += 2;
      writeWrappedText(
        `Foundational Familiarity: ${basicSkills.join(", ")}`,
        9.4,
        "normal",
        [71, 85, 105]
      );
    }
    if (domainKeywords.length > 0) {
      y += 2;
      writeWrappedText(
        `Domain & Methodologies: ${domainKeywords.join(", ")}`,
        9.5,
        "normal",
        [51, 65, 85]
      );
    }
  }

  // 7. Practical AI Usage & Workflows
  if ((resume.aiUsage || []).length > 0) {
    writeSectionHeading("AI Fluency & Workflows");
    resume.aiUsage.forEach((item) => {
      writeWrappedText(`- ${item}`, 9.5, "normal", [17, 24, 39], 4);
    });
  }

  // 8. Work Experience
  if (resume.experience.length > 0) {
    writeSectionHeading("Work Experience");
    resume.experience.forEach((exp, expIdx) => {
      if (expIdx > 0) y += 5;
      ensureSpace(32);

      // Role Title + Dates on clean single-column lines for 100% ATS pre-fill reliability
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.2);
      doc.setTextColor(15, 23, 42);
      doc.text(sanitizeDashes(exp.role || "Role"), marginX, y);

      const dateRange = sanitizeDashes(
        `${exp.startDate || ""} - ${exp.endDate || "Present"}`
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      const dateW = doc.getTextWidth(dateRange);
      doc.text(dateRange, pageWidth - marginX - dateW, y);
      y += 13;

      const complianceTag = formatExperienceComplianceTag(exp);
      const companyLoc = [exp.company, exp.location, complianceTag]
        .map((s) => sanitizeDashes(s || "").trim())
        .filter(Boolean)
        .join(" | ");
      if (companyLoc) {
        writeWrappedText(companyLoc, 9.6, "bold", [51, 65, 85]);
        y += 1;
      }

      exp.bullets.forEach((origBullet, bIdx) => {
        const proposal = workspace?.bullets.find(
          (b) => b.experienceId === exp.id && b.bulletIndex === bIdx
        );
        const chosenText =
          proposal && proposal.approved && !proposal.ungroundedWarning
            ? proposal.tailoredBullet
            : origBullet;
        if (chosenText.trim()) {
          writeWrappedText(`- ${chosenText.trim()}`, 9.5, "normal", [17, 24, 39], 4);
        }
      });
    });
  }

  // 9. Personal Projects & Portfolio URLs
  if ((resume.projects || []).length > 0) {
    writeSectionHeading("Personal Projects");
    resume.projects.forEach((proj, pIdx) => {
      if (pIdx > 0) y += 4;
      ensureSpace(26);
      const titleAndStack = [proj.name, proj.techStack]
        .map((s) => sanitizeDashes(s || "").trim())
        .filter(Boolean)
        .join(" | ");
      writeWrappedText(titleAndStack, 9.8, "bold", [15, 23, 42]);
      if (proj.url?.trim()) {
        ensureSpace(13);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(37, 99, 235);
        const cleanProjUrl = sanitizeDashes(proj.url.trim());
        doc.textWithLink(cleanProjUrl, marginX + 4, y, {
          url: ensureHttpUrl(cleanProjUrl),
        });
        y += 12.5;
      }
      if (proj.description?.trim()) {
        writeWrappedText(
          `- ${proj.description.trim()}`,
          9.5,
          "normal",
          [17, 24, 39],
          4
        );
      }
    });
  }

  // 10. Key Accomplishments
  if ((resume.accomplishments || []).length > 0) {
    writeSectionHeading("Key Accomplishments & Awards");
    resume.accomplishments.forEach((acc) => {
      if (acc.trim()) {
        writeWrappedText(`- ${acc.trim()}`, 9.5, "normal", [17, 24, 39], 4);
      }
    });
  }

  // 11. Education
  if (resume.education.length > 0) {
    writeSectionHeading("Education");
    resume.education.forEach((ed) => {
      const eduLine = [ed.degree, ed.institution, ed.year]
        .map((s) => sanitizeDashes(s || "").trim())
        .filter(Boolean)
        .join(" | ");
      writeWrappedText(eduLine, 9.6, "normal", [17, 24, 39]);
    });
  }

  // 12. Certifications
  if (resume.certifications.length > 0) {
    writeSectionHeading("Certifications & Licenses");
    resume.certifications.forEach((cert) => {
      if (cert.trim()) {
        writeWrappedText(`- ${cert.trim()}`, 9.5, "normal", [17, 24, 39], 4);
      }
    });
  }

  const defaultSlug = targetApp
    ? `${c.name || "resume"}_${targetApp.company}_${targetApp.role}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
    : `${c.name || "master"}_ats_resume`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");

  doc.save(filename || `${defaultSlug}.pdf`);
}

export interface CoverLetterPdfOptions {
  targetCompany?: string;
  targetRole?: string;
  filename?: string;
}

export function downloadCoverLetterPdf(
  resume: MasterResume,
  coverLetterBody: string,
  options: CoverLetterPdfOptions = {}
): void {
  const { targetCompany, targetRole, filename } = options;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const marginTop = 54;
  const marginBottom = 54;
  const maxWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const c = resume.contact;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizeDashes(c.name || "Candidate Name"), marginX, y);
  y += 15;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const contactLine = [
    c.location,
    c.phone,
    c.email,
    ...collectAllProfileUrls(c).slice(0, 2),
  ]
    .map((s) => sanitizeDashes(s || "").trim())
    .filter(Boolean)
    .join(" | ");
  if (contactLine) {
    const contactWrapped: string[] = doc.splitTextToSize(contactLine, maxWidth);
    contactWrapped.forEach((line) => {
      doc.text(line, marginX, y);
      y += 13;
    });
  }

  y += 4;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.75);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 22;

  // Date & Subject
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(todayIsoDate(), marginX, y);
  y += 18;

  if (targetCompany || targetRole) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const reLine = sanitizeDashes(
      `Re: ${[targetRole, targetCompany].filter(Boolean).join(" - ")}`
    );
    doc.text(reLine, marginX, y);
    y += 20;
  }

  // Body paragraphs
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);

  const paragraphs = sanitizeDashes(coverLetterBody || "").split(/\n\s*\n/);
  const lineStep = 15.5;

  paragraphs.forEach((para) => {
    const trimmed = para.trim();
    if (!trimmed) return;
    const subLines = trimmed.split("\n");
    subLines.forEach((sub) => {
      const wrapped: string[] = doc.splitTextToSize(sub, maxWidth);
      wrapped.forEach((wLine) => {
        if (y + lineStep > pageHeight - marginBottom) {
          doc.addPage();
          y = marginTop;
        }
        doc.text(wLine, marginX, y);
        y += lineStep;
      });
    });
    y += 8;
  });

  const slug = targetCompany
    ? `${c.name || "candidate"}_${targetCompany}_cover_letter`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
    : `${c.name || "master"}_cover_letter`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");

  doc.save(filename || `${slug}.pdf`);
}
