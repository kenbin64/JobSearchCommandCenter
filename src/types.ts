export enum ApplicationStage {
  Saved = "Saved",
  Applied = "Applied",
  RecruiterScreen = "Recruiter screen",
  TechnicalInterview = "Technical interview",
  FinalInterview = "Final interview",
  Offer = "Offer",
  Closed = "Closed",
}

export enum ClosedReason {
  None = "",
  HiredElsewhere = "hired elsewhere",
  Declined = "declined",
  NoResponse = "no response",
  Rejected = "rejected",
}

export enum TimelineEventType {
  Applied = "Applied",
  Contact = "Contact",
  Interview = "Interview",
  Offer = "Offer",
  Note = "Note",
}

export enum InterviewType {
  RecruiterScreen = "Recruiter screen",
  Technical = "Technical",
  Panel = "Panel",
  Final = "Final",
}

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  substackUrl?: string;
  workAuthorization?: string;
  securityClearance?: string;
  workPreference?: string;
  links: string[];
}

export interface ExperienceEntry {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
  rawBrainstorm?: string;
  isConfidentialNda?: boolean;
  isClearanceRestricted?: boolean;
  roleSecurityClearance?: string;
  confidentialityNote?: string;
  includeComplianceTag?: boolean;
}

export interface BrainstormConversionInput {
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
}

export interface BrainstormConversionResult {
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
  promotionSummary: string;
  extractedSkills: string[];
  extractedKeywords: string[];
  extractedAccomplishments: string[];
  confidentialityNote: string;
  complianceNotes: string[];
  usedAiModel: boolean;
}

export interface PersonalProjectEntry {
  id: string;
  name: string;
  url: string;
  techStack: string;
  description: string;
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  year: string;
}

export type SkillWeight = 1 | 2 | 3 | 4 | 5;

export interface MasterResume {
  contact: ContactInfo;
  targetJobTitles: string[];
  summary: string;
  experience: ExperienceEntry[];
  projects: PersonalProjectEntry[];
  education: EducationEntry[];
  skills: string[];
  skillWeights?: Record<string, SkillWeight>;
  skillNotes?: Record<string, string>;
  includeWeightOneOnResume?: boolean;
  atsKeywords: string[];
  aiUsage: string[];
  certifications: string[];
  accomplishments: string[];
  defaultCoverLetter?: string;
}

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  contactName: string;
  contactEmail: string;
  source: string;
  jobUrl: string;
  stage: ApplicationStage;
  stageReason: ClosedReason;
  rejectedAt?: string;
  rejectionStage?: string;
  rejectionNotes?: string;
  jobDescription: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  applicationId: string;
  date: string; // YYYY-MM-DD
  type: TimelineEventType;
  notes: string;
  sequence: number;
}

export interface InterviewQuestion {
  topic: string;
  text: string;
}

export interface InterviewRecord {
  id: string;
  applicationId: string;
  date: string; // YYYY-MM-DD
  type: InterviewType;
  interviewers: string;
  selfGrade: number; // 1 to 5
  highlights: string;
  improvements: string;
  questions: InterviewQuestion[];
}

export interface TailoredBulletProposal {
  id: string;
  experienceId: string;
  bulletIndex: number;
  originalBullet: string;
  tailoredBullet: string;
  rationale: string;
  approved: boolean;
  ungroundedWarning: string;
}

export interface TailoredWorkspace {
  applicationId: string;
  tailoredHeadline?: string;
  tailoredSummary?: string;
  confirmedSkills: string[];
  learningOnlySkills: string[];
  requiredSkillsFound: string[];
  matchScore: number;
  bullets: TailoredBulletProposal[];
  coverLetter: string;
  managerFlags: string[];
  usedAiModel: boolean;
  updatedAt: string;
}

export type AtsProvider = "greenhouse" | "lever" | "ashby";

export interface SavedBoardConnection {
  id: string;
  provider: AtsProvider;
  slug: string;
  label: string;
}

export interface DiscoveredJob {
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

export interface AutofillFieldRow {
  field: string;
  extractedValue: string;
  status: "Clean" | "Warning" | "Missing";
  note: string;
}

export interface RoleBulletPriority {
  experienceId: string;
  company: string;
  role: string;
  reorderedBullets: string[];
  leadReason: string;
}

export interface ResumeEvaluationReport {
  atsCompatibilityScore: number;
  hiringManagerReadabilityScore: number;
  topFoldHeadline: string;
  autofillFields: AutofillFieldRow[];
  parserFixes: string[];
  hiringManagerPriorities: string[];
  reorderedExperience: RoleBulletPriority[];
  usedAiModel: boolean;
  evaluatedAt: string;
}

export type ActivityLogCategory =
  | "pipeline"
  | "resume"
  | "tailoring"
  | "interview"
  | "backup"
  | "retention";

export interface ActivityLogEntry {
  id: string;
  timestamp: string; // ISO 8601 timestamp
  category: ActivityLogCategory;
  summary: string;
}

export interface AppState {
  welcomeDismissed: boolean;
  masterResume: MasterResume;
  applications: ApplicationRecord[];
  events: TimelineEvent[];
  interviews: InterviewRecord[];
  tailoredByApp: Record<string, TailoredWorkspace>;
  savedBoards: SavedBoardConnection[];
  resumeEvaluation?: ResumeEvaluationReport | null;
  activityLog?: ActivityLogEntry[];
  retentionDays?: number; // 0 = Keep Indefinitely, or 30 / 90 / 180 / 365 days
}

