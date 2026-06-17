import { Component, HostListener, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ValidationApiService } from './services/validation-api.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import {
  BatchValidationResult,
  CorrectionChangeType,
  MatchSource,
  ParentAppliesToItem,
  ParentValidationResult,
  ValidationHistory,
  ValidationResult
} from './models/validation.models';
import {
  BucketKey,
  FieldType,
  OverridePopoverRequest,
  ValidationRow
} from './validation-result-table.component';

interface PendingOverride {
  fileIndex: number;
  fieldType: FieldType;
  row: ValidationRow;
  top: number;
  left: number;
  originalName: string;
  initialValue: string;
  placeholder: string;
}

export interface StoredCorrectionRecord {
  fieldType: 'Tenant' | 'Parent';
  originalName: string;
  correctedName: string;
  changeType: CorrectionChangeType;
  confidence: number | null;
  matchSource: MatchSource;
  unitId: string;
  building: string;
  appliesTo: ParentAppliesToItem[];
}

interface StatusBucketConfig {
  key: BucketKey;
  label: string;
  headerClass: string;
}

interface FieldGroupConfig {
  type: FieldType;
  label: string;
  nameColumnLabel: string;
}

type BulkActionType = 'apply-all' | 'accept-as-is' | 'standardise' | 'align-master';

interface PendingBulkAction {
  type: BulkActionType;
  fileIndex: number;
  fieldType: FieldType;
  fieldLabel: string;
}

interface BulkConfirmConfig {
  label: string;
  description: (fieldLabel: string) => string;
  confirmClass: string;
}

type DownloadStepStatus = 'pending' | 'active' | 'done' | 'failed';

interface DownloadChecklistState {
  steps: [DownloadStepStatus, DownloadStepStatus, DownloadStepStatus];
  activeStep: 1 | 2 | 3 | null;
  errorMessage: string | null;
  inProgress: boolean;
}

@Component({
  selector: 'app-validation',
  standalone: false,
  templateUrl: './validation.component.html',
  styleUrls: ['./validation.component.scss']
})
export class ValidationComponent implements OnDestroy {
  private static readonly DOWNLOAD_STEP_MS = 800;

  private static readonly BULK_CONFIRM_CONFIG: Record<BulkActionType, BulkConfirmConfig> = {
    'apply-all': {
      label: 'Apply All Suggestions',
      description: (fieldLabel) =>
        `This will accept the suggested name for every row in ${fieldLabel.toLowerCase()} that has a suggestion.`,
      confirmClass: 'confirm-dialog__btn--amber'
    },
    'accept-as-is': {
      label: 'Accept All As-Is',
      description: (fieldLabel) =>
        `This will keep every new name in ${fieldLabel.toLowerCase()} exactly as it appears in your file, with no changes.`,
      confirmClass: 'confirm-dialog__btn--green'
    },
    standardise: {
      label: 'Standardise All',
      description: (fieldLabel) =>
        `This will apply the standardised spelling for every flagged name in ${fieldLabel.toLowerCase()} that only needs formatting fixes.`,
      confirmClass: 'confirm-dialog__btn--red'
    },
    'align-master': {
      label: 'Align to Master List',
      description: (fieldLabel) =>
        `This will align every correct ${fieldLabel.toLowerCase()} row whose Excel name differs from the master list canonical name.`,
      confirmClass: 'confirm-dialog__btn--amber'
    }
  };

  private readonly downloadTimers = new Map<number, number[]>();
  private readonly downloadSubscriptions = new Map<number, Subscription>();
  private readonly downloadGeneration = new Map<number, number>();

  selectedFiles: File[] = [];
  asOfDate: string = this.todayLocalIso();
  batchResults: BatchValidationResult[] = [];
  isLoading = false;
  errorMessage = '';
  isDragging = false;

  expandedFiles = new Set<number>();
  expandedFieldGroups = new Set<string>();
  expandedSections = new Set<string>();
  corrections = new Map<string, StoredCorrectionRecord>();
  downloadProgressByFile = new Map<number, DownloadChecklistState>();

  /** FIX 3: bump when corrections mutate so table inputs reuse stable Map/Set refs. */
  private correctionsVersion = 0;
  private readonly correctionMapCache = new Map<string, Map<string, string>>();
  private readonly correctionMapCacheVersion = new Map<string, number>();
  private readonly acceptedKeysCache = new Map<string, Set<string>>();
  private readonly acceptedKeysCacheVersion = new Map<string, number>();
  private readonly rowsForBucketCache = new Map<string, ValidationRow[]>();

  showHistory = false;
  history: ValidationHistory[] = [];
  historyLoading = false;
  historyError = '';
  pendingBulkAction: PendingBulkAction | null = null;
  pendingOverride: PendingOverride | null = null;

  readonly downloadStepLabels = [
    'Applying your corrections',
    'Saving validated names to database',
    'Generating corrected Excel file'
  ] as const;

  readonly statusBuckets: StatusBucketConfig[] = [
    { key: 'new', label: '🆕 New Names', headerClass: 'bucket-header--new' },
    { key: 'flagged', label: '🚨 Flagged', headerClass: 'bucket-header--flagged' },
    { key: 'suggested', label: '⚠️ Suggested', headerClass: 'bucket-header--suggested' },
    { key: 'excluded', label: '✅ Correct', headerClass: 'bucket-header--correct' }
  ];

  constructor(
    private validationApi: ValidationApiService,
    private notify: NotificationService
  ) {}

  get canValidate(): boolean {
    return this.selectedFiles.length > 0 && !this.isLoading;
  }

  get asOfDisplay(): string {
    if (!this.asOfDate) {
      return '';
    }
    const [y, m, d] = this.asOfDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  private todayLocalIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.setFiles(Array.from(files));
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.setFiles(Array.from(files));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(): void {
    this.isDragging = false;
  }

  private setFiles(files: File[]): void {
    const invalid = files.filter(f => !f.name.toLowerCase().endsWith('.xlsx'));
    if (invalid.length > 0) {
      this.errorMessage = 'Only .xlsx files are accepted.';
      this.notify.error(this.errorMessage);
      return;
    }

    this.errorMessage = '';
    this.selectedFiles = files;
    this.resetResultsState();
  }

  private resetResultsState(): void {
    this.clearAllDownloadRuns();
    this.batchResults = [];
    this.expandedFiles = new Set<number>();
    this.expandedFieldGroups = new Set<string>();
    this.expandedSections = new Set<string>();
    this.corrections = new Map<string, StoredCorrectionRecord>();
    this.downloadProgressByFile = new Map<number, DownloadChecklistState>();
    this.bumpCorrectionsCache();
    this.clearRowsForBucketCache();
  }

  ngOnDestroy(): void {
    this.clearAllDownloadRuns();
  }

  validate(): void {
    if (this.selectedFiles.length === 0 || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.resetResultsState();

    this.validationApi.validateBatch(this.selectedFiles, this.asOfDate).subscribe({
      next: (results) => {
        this.batchResults = results;
        this.isLoading = false;
        this.loadHistory();
      },
      error: (err) => {
        console.error('Validation batch failed:', err);
        this.isLoading = false;
        this.errorMessage =
          err?.error?.message ||
          'Failed to connect to the API. Make sure the backend is running.';
        this.notify.error(this.errorMessage);
      }
    });
  }

  toggleFile(fileIndex: number): void {
    const set = new Set(this.expandedFiles);
    if (set.has(fileIndex)) {
      set.delete(fileIndex);
    } else {
      set.add(fileIndex);
    }
    this.expandedFiles = set;
  }

  isFileExpanded(fileIndex: number): boolean {
    return this.expandedFiles.has(fileIndex);
  }

  toggleFieldGroup(fileIndex: number, fieldType: FieldType, event?: Event): void {
    event?.stopPropagation();
    const key = `${fileIndex}-group-${fieldType}`;
    const set = new Set(this.expandedFieldGroups);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    this.expandedFieldGroups = set;
  }

  isFieldGroupExpanded(fileIndex: number, fieldType: FieldType): boolean {
    return this.expandedFieldGroups.has(`${fileIndex}-group-${fieldType}`);
  }

  toggleSection(fileIndex: number, fieldType: FieldType, bucket: BucketKey, event?: Event): void {
    event?.stopPropagation();
    const key = `${fileIndex}-${fieldType}-${bucket}`;
    const set = new Set(this.expandedSections);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    this.expandedSections = set;
  }

  isSectionExpanded(fileIndex: number, fieldType: FieldType, bucket: BucketKey): boolean {
    return this.expandedSections.has(`${fileIndex}-${fieldType}-${bucket}`);
  }

  hasParentResponse(fileIndex: number): boolean {
    return this.batchResults[fileIndex]?.parentResponse != null;
  }

  fieldGroupsFor(fileIndex: number): FieldGroupConfig[] {
    const groups: FieldGroupConfig[] = [
      { type: 'tenant', label: 'Tenant names', nameColumnLabel: 'Tenant Name' }
    ];
    if (this.hasParentResponse(fileIndex)) {
      groups.push({ type: 'parent', label: 'Parent names', nameColumnLabel: 'Parent Name' });
    }
    return groups;
  }

  rowsForBucket(fileIndex: number, fieldType: FieldType, bucket: BucketKey): ValidationRow[] {
    const cacheKey = `${fileIndex}|${fieldType}|${bucket}`;
    const cached = this.rowsForBucketCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = this.batchResults[fileIndex];
    if (!result) {
      return [];
    }

    let rows: ValidationRow[];
    if (fieldType === 'tenant') {
      rows = result.response.results.filter(r => r.status === bucket);
    } else if (!result.parentResponse) {
      rows = [];
    } else {
      rows = result.parentResponse.results.filter(r => r.status === bucket);
    }

    this.rowsForBucketCache.set(cacheKey, rows);
    return rows;
  }

  private clearRowsForBucketCache(): void {
    this.rowsForBucketCache.clear();
  }

  bucketCount(fileIndex: number, fieldType: FieldType, bucket: BucketKey): number {
    return this.rowsForBucket(fileIndex, fieldType, bucket).length;
  }

  tenantSummary(fileIndex: number): string {
    const response = this.batchResults[fileIndex]?.response;
    if (!response) {
      return '';
    }
    return `${response.flagged} flagged · ${response.suggested} suggested · ${response.excluded} correct`;
  }

  parentSummary(fileIndex: number): string {
    const response = this.batchResults[fileIndex]?.parentResponse;
    if (!response) {
      return '';
    }
    return `${response.flagged} flagged · ${response.suggested} suggested · ${response.excluded} correct`;
  }

  acceptedCount(fileIndex: number): number {
    const prefix = `${fileIndex}|`;
    let count = 0;
    this.corrections.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        count++;
      }
    });
    return count;
  }

  tableAcceptedKeys(fileIndex: number, fieldType: FieldType): Set<string> {
    const cacheKey = this.tableCacheKey(fileIndex, fieldType);
    const cachedVersion = this.acceptedKeysCacheVersion.get(cacheKey);
    if (cachedVersion === this.correctionsVersion) {
      const cached = this.acceptedKeysCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const prefix = this.tableKeyPrefix(fileIndex, fieldType);
    const keys = new Set<string>();
    this.corrections.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keys.add(key.slice(prefix.length));
      }
    });
    this.acceptedKeysCache.set(cacheKey, keys);
    this.acceptedKeysCacheVersion.set(cacheKey, this.correctionsVersion);
    return keys;
  }

  tableCorrectionMap(fileIndex: number, fieldType: FieldType): Map<string, string> {
    const cacheKey = this.tableCacheKey(fileIndex, fieldType);
    const cachedVersion = this.correctionMapCacheVersion.get(cacheKey);
    if (cachedVersion === this.correctionsVersion) {
      const cached = this.correctionMapCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const prefix = this.tableKeyPrefix(fileIndex, fieldType);
    const map = new Map<string, string>();
    this.corrections.forEach((record, key) => {
      if (key.startsWith(prefix)) {
        map.set(key.slice(prefix.length), record.correctedName);
      }
    });
    this.correctionMapCache.set(cacheKey, map);
    this.correctionMapCacheVersion.set(cacheKey, this.correctionsVersion);
    return map;
  }

  private tableCacheKey(fileIndex: number, fieldType: FieldType): string {
    return `${fileIndex}|${fieldType}`;
  }

  private bumpCorrectionsCache(): void {
    this.correctionsVersion++;
  }

  onTableAccept(fileIndex: number, fieldType: FieldType, row: ValidationRow): void {
    this.pendingOverride = null;
    this.acceptRow(fileIndex, fieldType, row);
  }

  onTableOverrideRequest(
    fileIndex: number,
    fieldType: FieldType,
    request: OverridePopoverRequest
  ): void {
    const correctionMap = this.tableCorrectionMap(fileIndex, fieldType);
    this.pendingOverride = {
      fileIndex,
      fieldType,
      row: request.row,
      top: request.top,
      left: request.left,
      originalName: request.row.tenantName,
      initialValue: correctionMap.get(this.tableRowKey(fieldType, request.row)) ?? '',
      placeholder: request.placeholder
    };
  }

  onOverrideSave(value: string): void {
    if (!this.pendingOverride) {
      return;
    }
    const { fileIndex, fieldType, row } = this.pendingOverride;
    this.setManualCorrection(fileIndex, fieldType, row, value);
    this.pendingOverride = null;
  }

  cancelOverride(): void {
    this.pendingOverride = null;
  }

  onTableManual(fileIndex: number, fieldType: FieldType, event: { row: ValidationRow; value: string }): void {
    this.setManualCorrection(fileIndex, fieldType, event.row, event.value);
  }

  onTableClear(fileIndex: number, fieldType: FieldType, row: ValidationRow): void {
    this.clearCorrection(fileIndex, fieldType, row);
  }

  private tableKeyPrefix(fileIndex: number, fieldType: FieldType): string {
    return `${fileIndex}|${fieldType}|`;
  }

  hasSuggestion(row: ValidationRow): boolean {
    const value = row.suggestion ?? row.suggestedName;
    return value != null && String(value).trim().length > 0;
  }

  private isAcceptAsIsRow(row: ValidationRow): boolean {
    return row.status?.toLowerCase() === 'new';
  }

  get bulkConfirmTitle(): string {
    if (!this.pendingBulkAction) {
      return '';
    }
    return ValidationComponent.BULK_CONFIRM_CONFIG[this.pendingBulkAction.type].label;
  }

  get bulkConfirmDescription(): string {
    if (!this.pendingBulkAction) {
      return '';
    }
    const config = ValidationComponent.BULK_CONFIRM_CONFIG[this.pendingBulkAction.type];
    return config.description(this.pendingBulkAction.fieldLabel);
  }

  get bulkConfirmClass(): string {
    if (!this.pendingBulkAction) {
      return '';
    }
    return ValidationComponent.BULK_CONFIRM_CONFIG[this.pendingBulkAction.type].confirmClass;
  }

  requestBulkAction(
    type: BulkActionType,
    fileIndex: number,
    fieldType: FieldType,
    fieldLabel: string,
    event: Event
  ): void {
    event.stopPropagation();
    this.pendingBulkAction = { type, fileIndex, fieldType, fieldLabel };
  }

  cancelBulkAction(): void {
    this.pendingBulkAction = null;
  }

  confirmBulkAction(): void {
    const pending = this.pendingBulkAction;
    if (!pending) {
      return;
    }

    const { type, fileIndex, fieldType } = pending;
    this.pendingBulkAction = null;

    switch (type) {
      case 'apply-all':
        this.executeApplyAllSuggestions(fileIndex, fieldType);
        break;
      case 'accept-as-is':
        this.executeAcceptAllAsIs(fileIndex, fieldType);
        break;
      case 'standardise':
        this.executeStandardiseAll(fileIndex, fieldType);
        break;
      case 'align-master':
        this.executeAlignToMaster(fileIndex, fieldType);
        break;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.pendingBulkAction) {
      this.cancelBulkAction();
      return;
    }
    if (this.pendingOverride) {
      this.cancelOverride();
    }
  }

  private tableRowKey(fieldType: FieldType, row: ValidationRow): string {
    return row.tenantName;
  }

  acceptAsIsEligibleCount(fileIndex: number, fieldType: FieldType): number {
    return this.rowsForBucket(fileIndex, fieldType, 'new').length;
  }

  alignToMasterCount(fileIndex: number, fieldType: FieldType): number {
    return this.rowsAlignableToMaster(fileIndex, fieldType).length;
  }

  rowsAlignableToMaster(fileIndex: number, fieldType: FieldType): ValidationRow[] {
    const acceptedKeys = this.tableAcceptedKeys(fileIndex, fieldType);
    return this.rowsForBucket(fileIndex, fieldType, 'excluded')
      .filter(row =>
        this.isDivergentFromMaster(row)
        && !acceptedKeys.has(this.tableRowKey(fieldType, row)));
  }

  private isDivergentFromMaster(row: ValidationRow): boolean {
    if (!this.hasSuggestion(row)) {
      return false;
    }
    const canonical = (row.suggestion ?? row.suggestedName)?.trim();
    return canonical != null && canonical !== row.tenantName;
  }

  private executeAlignToMaster(fileIndex: number, fieldType: FieldType): void {
    for (const row of this.rowsAlignableToMaster(fileIndex, fieldType)) {
      const canonical = (row.suggestion ?? row.suggestedName)?.trim();
      if (!canonical) {
        continue;
      }
      this.setCorrection(fileIndex, fieldType, row, {
        correctedName: canonical,
        changeType: 'AcceptedSuggestion',
        confidence: row.confidence,
        matchSource: row.matchSource
      });
    }
  }

  private executeApplyAllSuggestions(fileIndex: number, fieldType: FieldType): void {
    for (const row of this.rowsForBucket(fileIndex, fieldType, 'suggested')) {
      if (this.hasSuggestion(row)) {
        this.acceptRow(fileIndex, fieldType, row);
      }
    }
  }

  private executeStandardiseAll(fileIndex: number, fieldType: FieldType): void {
    for (const row of this.rowsForBucket(fileIndex, fieldType, 'flagged')) {
      if (row.reason === 'Standardisation') {
        this.acceptRow(fileIndex, fieldType, row);
      }
    }
  }

  private executeAcceptAllAsIs(fileIndex: number, fieldType: FieldType): void {
    for (const row of this.rowsForBucket(fileIndex, fieldType, 'new')) {
      this.acceptRow(fileIndex, fieldType, row);
    }
  }

  acceptRow(fileIndex: number, fieldType: FieldType, row: ValidationRow): void {
    if (this.isAcceptAsIsRow(row)) {
      this.setCorrection(fileIndex, fieldType, row, {
        correctedName: row.tenantName.trim(),
        changeType: 'AcceptedAsIs',
        confidence: null,
        matchSource: 'AcceptedAsIs'
      });
      return;
    }

    const suggestion = (row.suggestion ?? row.suggestedName)?.trim();
    if (!suggestion) {
      return;
    }

    this.setCorrection(fileIndex, fieldType, row, {
      correctedName: suggestion,
      changeType: 'AcceptedSuggestion',
      confidence: row.confidence,
      matchSource: row.matchSource
    });
  }

  setManualCorrection(fileIndex: number, fieldType: FieldType, row: ValidationRow, value: string): void {
    if (value?.trim()) {
      this.setCorrection(fileIndex, fieldType, row, {
        correctedName: value.trim(),
        changeType: 'ManualOverride',
        confidence: null,
        matchSource: null
      });
    } else {
      this.clearCorrection(fileIndex, fieldType, row);
    }
  }

  clearCorrection(fileIndex: number, fieldType: FieldType, row: ValidationRow): void {
    const map = new Map(this.corrections);
    map.delete(this.correctionKey(fileIndex, fieldType, row));
    this.corrections = map;
    this.bumpCorrectionsCache();
  }

  private correctionKey(fileIndex: number, fieldType: FieldType, row: ValidationRow): string {
    const scope = fieldType === 'tenant' ? 'tenant' : 'parent';
    return `${fileIndex}|${scope}|${row.tenantName}`;
  }

  private setCorrection(
    fileIndex: number,
    fieldType: FieldType,
    row: ValidationRow,
    update: {
      correctedName: string;
      changeType: CorrectionChangeType;
      confidence: number | null;
      matchSource: MatchSource;
    }
  ): void {
    const map = new Map(this.corrections);
    const record: StoredCorrectionRecord = {
      fieldType: fieldType === 'tenant' ? 'Tenant' : 'Parent',
      originalName: row.tenantName,
      correctedName: update.correctedName,
      changeType: update.changeType,
      confidence: update.confidence,
      matchSource: update.matchSource,
      unitId: '',
      building: '',
      appliesTo: fieldType === 'tenant'
        ? this.tenantAppliesTo(row as ValidationResult)
        : (row as ParentValidationResult).appliesTo ?? []
    };
    map.set(this.correctionKey(fileIndex, fieldType, row), record);
    this.corrections = map;
    this.bumpCorrectionsCache();
  }

  downloadProgress(fileIndex: number): DownloadChecklistState | undefined {
    return this.downloadProgressByFile.get(fileIndex);
  }

  isDownloadInProgress(fileIndex: number): boolean {
    return this.downloadProgress(fileIndex)?.inProgress ?? false;
  }

  downloadFile(fileIndex: number, event?: Event): void {
    event?.stopPropagation();
    const file = this.selectedFiles[fileIndex];
    const batchResult = this.batchResults[fileIndex];
    if (!file || !batchResult) {
      return;
    }

    this.clearDownloadRun(fileIndex);
    const generation = (this.downloadGeneration.get(fileIndex) ?? 0) + 1;
    this.downloadGeneration.set(fileIndex, generation);

    this.setDownloadProgress(fileIndex, {
      steps: ['active', 'pending', 'pending'],
      activeStep: 1,
      errorMessage: null,
      inProgress: true
    });

    this.scheduleDownloadStep(fileIndex, generation, ValidationComponent.DOWNLOAD_STEP_MS, () => {
      const current = this.downloadProgress(fileIndex);
      if (!current?.inProgress || current.steps[2] === 'done') {
        return;
      }
      this.setDownloadProgress(fileIndex, {
        steps: ['done', 'active', 'pending'],
        activeStep: 2,
        errorMessage: null,
        inProgress: true
      });
    });

    this.scheduleDownloadStep(fileIndex, generation, ValidationComponent.DOWNLOAD_STEP_MS * 2, () => {
      const current = this.downloadProgress(fileIndex);
      if (!current?.inProgress || current.steps[2] === 'done') {
        return;
      }
      this.setDownloadProgress(fileIndex, {
        steps: ['done', 'done', 'active'],
        activeStep: 3,
        errorMessage: null,
        inProgress: true
      });
    });

    const tenantCorrections = this.correctionsForFile(fileIndex)
      .filter(c => c.fieldType === 'Tenant')
      .flatMap(c => this.correctionTargets(c).map(target => ({
        unitId: target.unit,
        building: target.building,
        originalName: c.originalName,
        correctedName: c.correctedName,
        changeType: c.changeType,
        confidence: c.confidence,
        matchSource: c.matchSource
      })));

    const parentCorrections = this.correctionsForFile(fileIndex)
      .filter(c => c.fieldType === 'Parent')
      .map(c => ({
        originalName: c.originalName,
        correctedName: c.correctedName,
        changeType: c.changeType,
        confidence: c.confidence,
        matchSource: c.matchSource,
        appliesTo: c.appliesTo
      }));

    const subscription = this.validationApi
      .downloadCorrected(file, {
        fileId: batchResult.fileId,
        tenantCorrections,
        parentCorrections
      })
      .subscribe({
        next: (blob) => {
          if (this.downloadGeneration.get(fileIndex) !== generation) {
            return;
          }
          this.clearDownloadTimers(fileIndex);
          this.setDownloadProgress(fileIndex, {
            steps: ['done', 'done', 'done'],
            activeStep: null,
            errorMessage: null,
            inProgress: false
          });
          this.triggerFileDownload(file, blob);
          this.downloadSubscriptions.delete(fileIndex);
        },
        error: () => {
          if (this.downloadGeneration.get(fileIndex) !== generation) {
            return;
          }
          this.clearDownloadTimers(fileIndex);
          this.failDownloadAtActiveStep(fileIndex, 'Failed to generate corrected file.');
          this.downloadSubscriptions.delete(fileIndex);
        }
      });

    this.downloadSubscriptions.set(fileIndex, subscription);
  }

  private tenantAppliesTo(row: ValidationResult): ParentAppliesToItem[] {
    if (row.appliesTo?.length) {
      return row.appliesTo;
    }
    return [{ building: row.buildingName, unit: row.unitId }];
  }

  private correctionTargets(record: StoredCorrectionRecord): ParentAppliesToItem[] {
    if (record.appliesTo.length > 0) {
      return record.appliesTo;
    }
    if (record.unitId || record.building) {
      return [{ building: record.building, unit: record.unitId }];
    }
    return [];
  }

  private correctionsForFile(fileIndex: number): StoredCorrectionRecord[] {
    const prefix = `${fileIndex}|`;
    const list: StoredCorrectionRecord[] = [];
    this.corrections.forEach((record, key) => {
      if (key.startsWith(prefix)) {
        list.push(record);
      }
    });
    return list;
  }

  private triggerFileDownload(file: File, blob: Blob): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Corrected_${file.name}`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  private setDownloadProgress(fileIndex: number, state: DownloadChecklistState): void {
    const map = new Map(this.downloadProgressByFile);
    map.set(fileIndex, state);
    this.downloadProgressByFile = map;
  }

  private failDownloadAtActiveStep(fileIndex: number, message: string): void {
    const current = this.downloadProgress(fileIndex);
    const activeStep = current?.activeStep ?? 3;
    const steps: [DownloadStepStatus, DownloadStepStatus, DownloadStepStatus] = current
      ? [...current.steps]
      : ['pending', 'pending', 'pending'];
    steps[activeStep - 1] = 'failed';

    this.setDownloadProgress(fileIndex, {
      steps,
      activeStep: null,
      errorMessage: message,
      inProgress: false
    });
  }

  private scheduleDownloadStep(
    fileIndex: number,
    generation: number,
    delayMs: number,
    onFire: () => void
  ): void {
    const timerId = window.setTimeout(() => {
      if (this.downloadGeneration.get(fileIndex) !== generation) {
        return;
      }
      onFire();
    }, delayMs);

    const timers = this.downloadTimers.get(fileIndex) ?? [];
    timers.push(timerId);
    this.downloadTimers.set(fileIndex, timers);
  }

  private clearDownloadTimers(fileIndex: number): void {
    const timers = this.downloadTimers.get(fileIndex);
    if (timers) {
      timers.forEach(id => clearTimeout(id));
      this.downloadTimers.delete(fileIndex);
    }
  }

  private clearDownloadRun(fileIndex: number): void {
    this.clearDownloadTimers(fileIndex);
    const existing = this.downloadSubscriptions.get(fileIndex);
    existing?.unsubscribe();
    this.downloadSubscriptions.delete(fileIndex);
  }

  private clearAllDownloadRuns(): void {
    this.downloadTimers.forEach(timers => timers.forEach(id => clearTimeout(id)));
    this.downloadTimers.clear();
    this.downloadSubscriptions.forEach(sub => sub.unsubscribe());
    this.downloadSubscriptions.clear();
    this.downloadGeneration.clear();
  }

  toggleHistory(): void {
    this.showHistory = !this.showHistory;
    if (this.showHistory) {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    this.historyLoading = true;
    this.historyError = '';

    this.validationApi.getHistory().subscribe({
      next: (data) => {
        this.history = [...data].sort(
          (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        );
        this.historyLoading = false;
      },
      error: (err) => {
        console.error('Failed to load validation history:', err);
        this.historyLoading = false;
        this.historyError = 'Could not load upload history.';
      }
    });
  }

  /** Deferred stub — future: Fabric Lakehouse upload. */
  saveToCloud(): void {
    console.log('Save to Cloud clicked - not yet implemented');
  }

  trackByFileName(_index: number, result: BatchValidationResult): string {
    return result.fileName;
  }

  trackByStepLabel(_index: number, label: string): string {
    return label;
  }

  trackByHistoryId(_index: number, item: ValidationHistory): number {
    return item.id;
  }
}
