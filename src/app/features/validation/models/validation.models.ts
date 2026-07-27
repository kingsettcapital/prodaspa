export type ClassifyStatus = 'correct' | 'suggested' | 'flagged' | 'new';
export type FrontendStatus = 'excluded' | 'suggested' | 'flagged' | 'new';
export type MatchSource = 'MasterList' | 'Normalisation' | 'AcceptedAsIs' | 'AutoAligned' | null;
export type CorrectionChangeType = 'AcceptedSuggestion' | 'ManualOverride' | 'AcceptedAsIs';

export interface ValidationResult {
  rowIndex: number;
  propertyId: string;
  unitId: string;
  tenantName: string;
  targetName: string;
  buildingName: string;
  leaseStart: string;
  status: FrontendStatus;
  classifyStatus: ClassifyStatus;
  suggestion: string | null;
  matchSource: MatchSource;
  suggestedName: string | null;
  confidence: number | null;
  reason: string;
  isAmbiguousMultiParty?: boolean;
  appliesTo: ParentAppliesToItem[];
}

export interface ValidationResponse {
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
  new: number;
  results: ValidationResult[];
}

export interface ParentAppliesToItem {
  building: string;
  unit: string;
}

export interface ParentValidationResult {
  rowIndex: number;
  propertyId: string;
  unitId: string;
  tenantName: string;
  targetName: string;
  buildingName: string;
  leaseStart: string;
  status: FrontendStatus;
  classifyStatus: ClassifyStatus;
  suggestion: string | null;
  matchSource: MatchSource;
  suggestedName: string | null;
  confidence: number | null;
  reason: string;
  isAmbiguousMultiParty?: boolean;
  isBackfilledFromTenant?: boolean;
  appliesTo: ParentAppliesToItem[];
}

/**
 * True when accepting this row as-is would write an identity mapping
 * (CorrectedName === OriginalName) into ParentTenantMappingTbl from a
 * backfilled parent name — i.e. a name the source file never asserted as a
 * parent. Such a write would be served by Branch 2 at confidence 100 on every
 * later upload and permanently preempt fuzzy matching for that name.
 *
 * Deliberately narrow: a backfilled row carrying a real parent-master
 * suggestion is NOT suppressed and learns normally. Backend enforces the same
 * rule independently in DownloadCorrected; this is the UX half.
 *
 * Shared by validation.component.ts (bulk) and
 * validation-result-table.component.ts (per-row tick) — do not inline a copy.
 */
export function isIdentityBackfillRow(row: {
  isBackfilledFromTenant?: boolean;
  suggestion?: string | null;
  tenantName?: string;
}): boolean {
  if (!row.isBackfilledFromTenant) {
    return false;
  }
  const suggestion = (row.suggestion ?? '').trim();
  const name = (row.tenantName ?? '').trim();
  return suggestion.length === 0
    || suggestion.toLowerCase() === name.toLowerCase();
}

export interface ParentValidationResponse {
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
    new: number;
    isCopiedFromTenant?: boolean;
    results: ParentValidationResult[];
}

export interface BatchValidationResult {
  fileName: string;
  fileId: string;
  historyId: number;
  response: ValidationResponse;
  parentResponse: ParentValidationResponse | null;
}

export interface ValidationHistory {
  id: number;
  fileId: string;
  fileName: string;
  uploadedAt: string;
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
}

export interface CorrectionItem {
  rowIndex: number;
  unitId: string;
  building: string;
  originalName: string;
  correctedName: string;
  changeType: CorrectionChangeType;
  confidence: number | null;
  matchSource: MatchSource;
}

export interface ParentCorrectionItem {
  rowIndex: number;
  originalName: string;
  correctedName: string;
  changeType: CorrectionChangeType;
  confidence: number | null;
  matchSource: MatchSource;
  appliesTo: ParentAppliesToItem[];
}

export interface DownloadCorrectionsPayload {
  fileId: string;
  tenantCorrections: CorrectionItem[];
  parentCorrections: ParentCorrectionItem[];
  copyTenantToParent: boolean;
}

export interface DraftCounts {
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
  new: number;
}

export interface DraftSummary {
  id: number;
  fileId: string;
  fileName: string;
  status: string;
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
  new: number;
  savedAt: string;
  completedAt: string | null;
}

export interface DraftDetail {
  fileId: string;
  fileName: string;
  status: string;
  savedAt: string;
  completedAt: string | null;
  counts: DraftCounts;
  resultsJson: string;
  decisionsJson: string;
  fileBase64: string;
  fileContentType: string;
}
