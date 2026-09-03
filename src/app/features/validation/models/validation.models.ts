export type ClassifyStatus = 'correct' | 'suggested' | 'flagged' | 'new';
export type FrontendStatus = 'excluded' | 'suggested' | 'flagged' | 'new';
export type MatchSource = 'MasterList' | 'Normalisation' | 'NormalisedMatch' | 'AcceptedAsIs' | 'AutoAligned' | 'ManualOverride' | null;
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

export interface ParentValidationResponse {
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
    new: number;
    isCopiedFromTenant?: boolean;
    results: ParentValidationResult[];
}

/** Mapped CD display row. RR ValidationResult stays without rowIndexes. */
export interface ClosedDealsMappedRow extends ValidationResult {
  rowIndexes: number[];
}

/**
 * Derived from live POST /api/Validation/validate-batch of
 * CLOSED_DEALS_ADVERSARIAL_V1.xlsx (200). OverlayKey is not serialized.
 */
export interface ClosedDealsValidationGroup {
  building: string;
  unit: string;
  tenantName: string;
  rowIndexes: number[];
  classifyStatus: string;
  status: string;
  suggestion: string | null;
  matchSource: MatchSource;
  suggestedName: string;
  confidence: number | null;
  reason: string;
  isAmbiguousMultiParty: boolean;
}

export interface ClosedDealsParseError {
  code: string;
  message: string;
}

export interface ClosedDealsValidationResponse {
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
  new: number;
  groups: ClosedDealsValidationGroup[];
  error?: ClosedDealsParseError;
}

export interface BatchValidationResult {
  fileName: string;
  fileId: string;
  historyId: number;
  response: ValidationResponse;
  parentResponse: ParentValidationResponse | null;
  closedDealsResponse?: ClosedDealsValidationResponse;
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

/**
 * Mirrors prodagateway DownloadCorrectionsRequest.ClosedDealsCorrections
 * (ClosedDealsCorrectionItem). rowIndex is the same draft-resume extra the
 * tenant payload already sends; the C# model ignores unknown properties.
 */
export interface ClosedDealsCorrectionItem {
  rowIndex: number;
  section: 'ClosedDeals';
  building: string;
  unit: string;
  originalName: string;
  correctedName: string;
  changeType: CorrectionChangeType;
  confidence: number | null;
  matchSource: MatchSource;
}

export interface DownloadCorrectionsPayload {
  fileId: string;
  tenantCorrections: CorrectionItem[];
  parentCorrections: ParentCorrectionItem[];
  closedDealsCorrections: ClosedDealsCorrectionItem[];
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
