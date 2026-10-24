import React from "react";
import { MasterResume } from "../types";
import { downloadCoverLetterPdf, downloadResumePdf } from "../pdfGenerator";
import { ArrowRight, CheckCircle2, FileDown, ShieldCheck } from "lucide-react";

type TargetTab = "pipeline" | "boards" | "resume" | "match" | "momentum";

interface HowToUseGuideProps {
  masterResume: MasterResume;
  onNavigateTab: (tab: TargetTab) => void;
  onLoadDemo: () => void;
}

export const HowToUseGuide: React.FC<HowToUseGuideProps> = ({
  masterResume,
  onNavigateTab,
  onLoadDemo,
}) => {
  const workflowSteps: Array<{
    number: string;
    title: string;
    summary: string;
    details: string[];
    actionLabel: string;
    targetTab: TargetTab;
  }> = [
    {
      number: "01",
      title: "Upload or Build Your Editable Master Resume",
      summary:
        "Upload an existing .pdf, .docx, .txt, or .json resume or fill out the builder. Every single field, skill, URL, role, bullet, certification, and accomplishment is directly editable in place.",
      details: [
        "Include contact info, LinkedIn/GitHub/Portfolio/Substack URLs, Work Authorization, Security Clearance, Target Job Titles, Interview-Ready Skills, ATS Keywords, and Practical AI Usage.",
        "Use the Freeflow Job Brainstorm converter to turn unstructured raw notes (duties, benchmarks, promotions) into clean resume entries while enforcing NDA and Security Clearance protections.",
        "Click 'Download Master Resume (.pdf)' or 'Download Cover Letter (.pdf)' at the top, right sidebar, or bottom of the Master Resume tab anytime.",
      ],
      actionLabel: "Open Master Resume & Download PDF",
      targetTab: "resume",
    },
    {
      number: "02",
      title: "Discover & Import Roles From Job Boards",
      summary:
        "Search live public job feeds, pull directly from company Greenhouse/Lever/Ashby boards, or paste any posting URL.",
      details: [
        "Every live search result shows your Master Resume skill-overlap percentage before you even click in.",
        "Any posting or imported URL matching a role where you were previously rejected is automatically flagged with your prior rejection date, stage reached, and notes (plus a filter to hide previously rejected roles).",
        "Use External Board Launchers (Handshake, LinkedIn Jobs, Indeed, Utah Jobs, Wellfound) to browse login-gated portals, then paste any role link into 'Import by URL'.",
      ],
      actionLabel: "Open Job Boards",
      targetTab: "boards",
    },
    {
      number: "03",
      title: "Tailor Resume & 4-Pillar Cover Letter to Any Job",
      summary:
        "Use your Master Resume as a template to tailor your headline, summary, bullets, and business cover letter to a specific job description, then download selectable-text PDFs.",
      details: [
        "Confirm unlisted job skills you genuinely possess, assign a 1-5 proficiency weight (1: Basic/Name - add experience, 2-3: Some to Substantial, 4: Strong, 5: Expert), and add them directly to your Master Resume. Unconfirmed skills stay in Learning Only.",
        "When a job listing specifies Strong or Senior capability and a skill is marked 1 or 2, the fit engine rates it honestly across Strong fit, Worth it with tailoring, or Stretch.",
        "Edit every tailored headline, summary, bullet, and 4-pillar cover letter directly and click 'Download Tailored Resume (.pdf)' or 'Download Cover Letter (.pdf)'.",
      ],
      actionLabel: "Open Match & Tailor Studio",
      targetTab: "match",
    },
    {
      number: "04",
      title: "Track Pipeline Stages, Rejections, Momentum & Local Activity Log",
      summary:
        "Drag applications across Kanban stages, mark rejections in one click (to automatically flag future reposts), and manage your local-only activity & retention log.",
      details: [
        "Click 'Mark Rejected' (or 'Reject' on any card) to log the rejection date, stage reached, and feedback note; if the same URL, company + role, or reposted description comes up again anywhere, it is flagged immediately.",
        "Open any application drawer to edit details, edit or delete dated timeline events and 1-to-5 interview debriefs, draft neutral check-ins, or download that role's Resume PDF.",
        "Open Momentum to inspect weekly velocity, export your unified Activity Log (.csv), set local log auto-pruning (30/90/180/365 days or Keep Indefinitely), scrub raw brainstorms, or purge browser storage.",
      ],
      actionLabel: "Open Momentum & Activity Log",
      targetTab: "momentum",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>Quick-start workflow, PDF download locations & standing honesty rules</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            How to Use Job Search Command Center
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Every entry across your resume, cover letters, pipeline, events, and interview debriefs is editable in place. Follow the four steps below or download your PDFs directly.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            onLoadDemo();
            onNavigateTab("pipeline");
          }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          Load Sample Workspace
        </button>
      </div>

      {/* Direct Answer Card: Where to Download Resume & Cover Letter PDFs */}
      <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">
              Where to Download Your Resume & Cover Letter (.pdf, .html, .txt, .json)
            </h2>
            <p className="text-xs leading-relaxed text-slate-700">
              1. <strong>Baseline Master Resume & Cover Letter PDFs:</strong> Open the <strong>Master Resume</strong> tab (top header, right Download Center sidebar, or bottom export bar) or click the quick buttons here.
              <br />
              2. <strong>Job-Tailored Resume & 4-Pillar Cover Letter PDFs:</strong> Open the <strong>Match & Tailor</strong> tab, select your target job, edit any bullet or paragraph, and click <strong>Download Tailored Resume (.pdf)</strong> or <strong>Download Cover Letter (.pdf)</strong>.
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
            {masterResume.defaultCoverLetter?.trim() && (
              <button
                type="button"
                onClick={() =>
                  downloadCoverLetterPdf(
                    masterResume,
                    masterResume.defaultCoverLetter || ""
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5 text-slate-500" />
                Download Master Cover Letter (.pdf)
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateTab("match")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap cursor-pointer"
            >
              Tailored PDFs in Match & Tailor
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 4-Step Sequential Workflow */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {workflowSteps.map((step) => (
          <section
            key={step.number}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6"
          >
            <div>
              <div className="font-mono text-xs font-semibold tabular-nums text-blue-600">
                STEP {step.number}
              </div>
              <h2 className="mt-1 text-base font-semibold text-slate-900">
                {step.title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {step.summary}
              </p>

              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3.5 text-xs leading-relaxed text-slate-700">
                {step.details.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 pt-2">
              <button
                type="button"
                onClick={() => onNavigateTab(step.targetTab)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {step.actionLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* Standing Rules & Data Backup Reference */}
      <section className="grid grid-cols-1 gap-6 rounded-xl border border-slate-200 bg-white p-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Standing Honesty, Interview-Readiness & Anti-Trope Rules
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
            <li>
              <strong>Zero Fabrication & Interview Readiness:</strong> List only skills you can readily defend in live interviews. Tailored bullets and cover letters derive strictly from your Master Resume and confirmed skills.
            </li>
            <li>
              <strong>NDA & Security Clearance Safe:</strong> Mark confidential or clearance-governed work roles so raw brainstorm notes stay private in your browser and exported bullets generalize protected details safely.
            </li>
            <li>
              <strong>Zero AI Cliches or Long Dashes:</strong> Banned tropes (such as <em>delve</em>, <em>tapestry</em>, <em>thrilled to apply</em>, <em>synergy</em>, <em>results-driven</em>) are flagged and scrubbed automatically, and em/en dashes are never used.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Local-Only Data Retention, Activity Log & Backups
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
            <li>
              <strong>Zero Server Retention:</strong> Uploaded files and AI tailoring requests are processed statelessly in memory and never stored in a server database. Private raw brainstorm notes are stripped before job-tailoring requests.
            </li>
            <li>
              <strong>Browser LocalStorage + JSON & CSV Logs:</strong> All records and dated event logs persist locally in your browser. Configure auto-prune windows (30/90/180/365 days), export <code>.csv</code> activity logs or <code>.json</code> backups, scrub raw brainstorms, or purge local storage anytime in <strong>Momentum</strong>.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
};
