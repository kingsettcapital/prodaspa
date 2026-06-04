export type ClassifyStatus = 'correct' | 'suggested' | 'flagged';
export type FrontendStatus = 'excluded' | 'suggested' | 'flagged';
export type MatchSource = 'MasterList' | 'Normalisation' | 'AcceptedAsIs' | null;
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
}

export interface ValidationResponse {
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
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
  appliesTo: ParentAppliesToItem[];
}

export interface ParentValidationResponse {
  total: number;
  excluded: number;
  suggested: number;
  flagged: number;
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
}
