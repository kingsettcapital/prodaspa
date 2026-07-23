export type ClassifyStatus = 'correct' | 'suggested' | 'flagged' | 'new';
export type FrontendStatus = 'excluded' | 'suggested' | 'flagged' | 'new';
export type MatchSource = 'MasterList' | 'Normalisation' | 'AcceptedAsIs' | 'AutoAligned' | null;
export type CorrectionChangeType = 'AcceptedSuggestion' | 'ManualOverride' | 'AcceptedAsIs';

export interface ValidationResult {
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
  unitId: string;
  building: string;
  originalName: string;
  correctedName: string;
  changeType: CorrectionChangeType;
  confidence: number | null;
  matchSource: MatchSource;
}

export interface ParentCorrectionItem {
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
