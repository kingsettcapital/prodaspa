import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { MatButtonToggleChange } from '@angular/material/button-toggle';
import { PageEvent } from '@angular/material/paginator';
import { Subscription } from 'rxjs';
import { ValidationApiService } from './services/validation-api.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import {
  BatchValidationResult,
  CorrectionChangeType,
  DownloadCorrectionsPayload,
  DraftDetail,
  DraftSummary,
  MatchSource,
  ParentAppliesToItem,
  ParentValidationResult,
  ValidationHistory,
  ValidationResult,
  isIdentityBackfillRow
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
  rowIndex: number;
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

type BulkActionType = 'apply-all' | 'accept-as-is' | 'standardise';

interface PendingBulkAction {
  type: BulkActionType;
  fileIndex: number;
  fieldType: FieldType;
  fieldLabel: string;
}

interface PendingAmbiguousNotice {
  fileIndex: number;
  fieldType: FieldType;
  rows: ValidationRow[];
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
export class ValidationComponent implements OnInit, OnDestroy {
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
  /** Active Tenant/Parent tab per file card. Not persisted to drafts. */
  activeFieldTabByFile = new Map<number, FieldType>();
  /** Page index/size per (fileIndex, fieldType, bucketKey). Not persisted to drafts. */
  bucketPageState = new Map<string, { pageIndex: number; pageSize: number }>();
  corrections = new Map<string, StoredCorrectionRecord>();
  downloadProgressByFile = new Map<number, DownloadChecklistState>();
  private draftSaveState = new Map();

  private autoAlignApplied = false;

  readonly defaultPageSize = 50;
  readonly pageSizeOptions = [25, 50, 100];

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
  drafts: DraftSummary[] = [];
  draftsLoading = false;
  draftsError: string | null = null;
  pendingBulkAction: PendingBulkAction | null = null;
  pendingAmbiguousNotice: PendingAmbiguousNotice | null = null;
  pendingOverride: PendingOverride | null = null;

  readonly downloadStepLabels = [
    'Applying your corrections',
    'Saving validated names to database',
    'Generating corrected Excel file'
  ] as const;

  readonly displayBuckets: StatusBucketConfig[] = [
    { key: 'new', label: '🆕 New Names', headerClass: 'bucket-header--new' },
    { key: 'suggested', label: '⚠️ Suggested', headerClass: 'bucket-header--suggested' },
    { key: 'excluded', label: '✅ Corrected', headerClass: 'bucket-header--correct' }
  ];

  constructor(
    private validationApi: ValidationApiService,
    private notify: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadDrafts();
  }

  get canValidate(): boolean {
    return this.selectedFiles.length > 0 && !this.isLoading;
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
    this.parentCopyConfirmed.clear();
    this.expandedSections = new Set<string>();
    this.activeFieldTabByFile = new Map<number, FieldType>();
    this.bucketPageState = new Map<string, { pageIndex: number; pageSize: number }>();
    this.corrections = new Map<string, StoredCorrectionRecord>();
    this.downloadProgressByFile = new Map<number, DownloadChecklistState>();
    this.draftSaveState.clear();
    this.autoAlignApplied = false;
    this.bumpCorrectionsCache();
    this.clearRowsForBucketCache();
  }

  clearBatch(fileInput?: HTMLInputElement): void {
    this.resetResultsState();
    this.selectedFiles = [];
    this.errorMessage = '';
    if (fileInput) {
      fileInput.value = '';
    }
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
        this.autoStageAlignments();
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

  private parentCopyConfirmed = new Set<number>();

  isParentCopyPending(fileIndex: number): boolean {
    const pr = this.batchResults[fileIndex]?.parentResponse;
    return !!pr?.isCopiedFromTenant && !this.parentCopyConfirmed.has(fileIndex);
  }

  confirmParentCopy(fileIndex: number): void {
    this.parentCopyConfirmed.add(fileIndex);
  }

  cancelParentCopy(fileIndex: number, event?: Event): void {
    event?.stopPropagation();
    this.setActiveFieldTab(fileIndex, 'tenant');
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

  fieldGroupConfig(fieldType: FieldType): FieldGroupConfig {
    return fieldType === 'parent'
      ? { type: 'parent', label: 'Parent names', nameColumnLabel: 'Parent Name' }
      : { type: 'tenant', label: 'Tenant names', nameColumnLabel: 'Tenant Name' };
  }

  activeFieldType(fileIndex: number): FieldType {
    const tab = this.activeFieldTabByFile.get(fileIndex) ?? 'tenant';
    return tab === 'parent' && this.hasParentResponse(fileIndex) ? 'parent' : 'tenant';
  }

  onFieldToggleChange(fileIndex: number, event: MatButtonToggleChange): void {
    const type = event.value === 'parent' ? 'parent' : 'tenant';
    this.setActiveFieldTab(fileIndex, type);
  }

  private setActiveFieldTab(fileIndex: number, fieldType: FieldType): void {
    const map = new Map(this.activeFieldTabByFile);
    map.set(fileIndex, fieldType);
    this.activeFieldTabByFile = map;
  }

  fieldGroupRowCount(fileIndex: number, fieldType: FieldType): number {
    return this.displayBuckets.reduce(
      (sum, bucket) => sum + this.bucketCount(fileIndex, fieldType, bucket.key),
      0
    );
  }

  private pageStateKey(fileIndex: number, fieldType: FieldType, bucket: BucketKey): string {
    return `${fileIndex}|${fieldType}|${bucket}`;
  }

  pageIndexFor(fileIndex: number, fieldType: FieldType, bucket: BucketKey): number {
    return this.bucketPageState.get(this.pageStateKey(fileIndex, fieldType, bucket))?.pageIndex ?? 0;
  }

  pageSizeFor(fileIndex: number, fieldType: FieldType, bucket: BucketKey): number {
    return this.bucketPageState.get(this.pageStateKey(fileIndex, fieldType, bucket))?.pageSize
      ?? this.defaultPageSize;
  }

  shouldShowPaginator(fileIndex: number, fieldType: FieldType, bucket: BucketKey): boolean {
    return this.bucketCount(fileIndex, fieldType, bucket) > this.pageSizeFor(fileIndex, fieldType, bucket);
  }

  onBucketPage(
    fileIndex: number,
    fieldType: FieldType,
    bucket: BucketKey,
    event: PageEvent
  ): void {
    this.invalidatePagedSliceCache(fileIndex, fieldType, bucket);
    const map = new Map(this.bucketPageState);
    map.set(this.pageStateKey(fileIndex, fieldType, bucket), {
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    });
    this.bucketPageState = map;
  }

  /**
   * View-only page slice for the table binding. Full-bucket consumers must keep
   * calling rowsForDisplayBucket — never this method.
   */
  rowsForPagedDisplayBucket(
    fileIndex: number,
    fieldType: FieldType,
    key: BucketKey
  ): ValidationRow[] {
    const pageIndex = this.pageIndexFor(fileIndex, fieldType, key);
    const pageSize = this.pageSizeFor(fileIndex, fieldType, key);
    const cacheKey = `paged|${fileIndex}|${fieldType}|${key}|${pageIndex}|${pageSize}`;
    const cached = this.rowsForBucketCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const all = this.rowsForDisplayBucket(fileIndex, fieldType, key);
    const start = pageIndex * pageSize;
    const rows = all.slice(start, start + pageSize);
    this.rowsForBucketCache.set(cacheKey, rows);
    return rows;
  }

  private invalidatePagedSliceCache(
    fileIndex: number,
    fieldType: FieldType,
    bucket: BucketKey
  ): void {
    const prefix = `paged|${fileIndex}|${fieldType}|${bucket}|`;
    for (const key of Array.from(this.rowsForBucketCache.keys())) {
      if (key.startsWith(prefix)) {
        this.rowsForBucketCache.delete(key);
      }
    }
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

  private isVacantRow(row: ValidationRow): boolean {
    const reason = (row.reason ?? '').trim().toLowerCase();
    if (reason === 'blank / vacant') {
      return true;
    }
    const name = (row.tenantName ?? '').trim();
    return name.length === 0 || name.toUpperCase() === 'VACANT';
  }

  rowsForDisplayBucket(fileIndex: number, fieldType: FieldType, key: BucketKey): ValidationRow[] {
    const cacheKey = `display|${fileIndex}|${fieldType}|${key}`;
    const cached = this.rowsForBucketCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let rows: ValidationRow[];
    if (key === 'suggested') {
      rows = [
        ...this.rowsForBucket(fileIndex, fieldType, 'suggested'),
        ...this.rowsForBucket(fileIndex, fieldType, 'flagged')
      ].filter(r => !this.isVacantRow(r));
    } else {
      rows = this.rowsForBucket(fileIndex, fieldType, key).filter(r => !this.isVacantRow(r));
    }

    this.rowsForBucketCache.set(cacheKey, rows);
    return rows;
  }

  private clearRowsForBucketCache(): void {
    this.rowsForBucketCache.clear();
  }

  bucketCount(fileIndex: number, fieldType: FieldType, bucket: BucketKey): number {
    return this.rowsForDisplayBucket(fileIndex, fieldType, bucket).length;
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
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.pendingBulkAction) {
      this.cancelBulkAction();
      return;
    }
    if (this.pendingAmbiguousNotice) {
      this.dismissAmbiguousNotice();
      return;
    }
    if (this.pendingOverride) {
      this.cancelOverride();
    }
  }

  private tableRowKey(fieldType: FieldType, row: ValidationRow): string {
    return String(row.rowIndex);
  }

  acceptAsIsEligibleCount(fileIndex: number, fieldType: FieldType): number {
    const acceptedKeys = this.tableAcceptedKeys(fileIndex, fieldType);
    return this.rowsForDisplayBucket(fileIndex, fieldType, 'new')
      .filter(row =>
        !row.isAmbiguousMultiParty
        && !isIdentityBackfillRow(row)
        && !acceptedKeys.has(this.tableRowKey(fieldType, row)))
      .length;
  }

  ambiguousNewRows(fileIndex: number, fieldType: FieldType): ValidationRow[] {
    return this.rowsForDisplayBucket(fileIndex, fieldType, 'new')
      .filter(r => !!r.isAmbiguousMultiParty);
  }

  dismissAmbiguousNotice(): void {
    this.pendingAmbiguousNotice = null;
  }

  noticeReason(row: ValidationRow): string {
    return row.isAmbiguousMultiParty
      ? 'Ambiguous name'
      : 'Parent filled from tenant name';
  }

  noticeUnit(row: ValidationRow): string {
    const applies = this.noticeAppliesTo(row);
    if (applies.length === 0) {
      return '—';
    }
    const first = applies[0].unit?.trim() || '—';
    return applies.length > 1 ? `${first} (+${applies.length - 1} more)` : first;
  }

  noticeBuilding(row: ValidationRow): string {
    const applies = this.noticeAppliesTo(row);
    if (applies.length === 0) {
      return '—';
    }
    const first = applies[0].building?.trim() || '—';
    return applies.length > 1 ? `${first} (+${applies.length - 1} more)` : first;
  }

  private noticeAppliesTo(row: ValidationRow): ParentAppliesToItem[] {
    if (!this.pendingAmbiguousNotice) {
      return [];
    }
    if (this.pendingAmbiguousNotice.fieldType === 'tenant') {
      const tenant = row as ValidationResult;
      if (tenant.appliesTo?.length) {
        return tenant.appliesTo;
      }
      return [{ building: tenant.buildingName, unit: tenant.unitId }];
    }
    return (row as ParentValidationResult).appliesTo ?? [];
  }

  applyAllSuggestionsCount(fileIndex: number, fieldType: FieldType): number {
    return this.rowsApplicableSuggestions(fileIndex, fieldType).length;
  }

  rowsApplicableSuggestions(fileIndex: number, fieldType: FieldType): ValidationRow[] {
    const acceptedKeys = this.tableAcceptedKeys(fileIndex, fieldType);
    return this.rowsForDisplayBucket(fileIndex, fieldType, 'suggested')
      .filter(row =>
        this.hasSuggestion(row)
        && !acceptedKeys.has(this.tableRowKey(fieldType, row)));
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

  private autoStageAlignments(): void {
    if (this.autoAlignApplied) {
      return;
    }
    this.batchResults.forEach((_, fileIndex) => {
      this.autoStageForField(fileIndex, 'tenant');
      this.autoStageForField(fileIndex, 'parent');
    });
    this.autoAlignApplied = true;
  }

  private autoStageForField(fileIndex: number, fieldType: FieldType): void {
    for (const row of this.rowsAlignableToMaster(fileIndex, fieldType)) {
      const canonical = (row.suggestion ?? row.suggestedName)?.trim();
      if (!canonical) {
        continue;
      }
      this.setCorrection(fileIndex, fieldType, row, {
        correctedName: canonical,
        changeType: 'AcceptedSuggestion',
        confidence: row.confidence,
        matchSource: 'AutoAligned'
      });
    }
  }

  private executeApplyAllSuggestions(fileIndex: number, fieldType: FieldType): void {
    for (const row of this.rowsForDisplayBucket(fileIndex, fieldType, 'suggested')) {
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
    for (const row of this.rowsForDisplayBucket(fileIndex, fieldType, 'new')) {
      if (row.isAmbiguousMultiParty || isIdentityBackfillRow(row)) {
        continue;
      }
      this.acceptRow(fileIndex, fieldType, row);
    }

    const ambiguous = this.ambiguousNewRows(fileIndex, fieldType);
    const identityBackfill = this.rowsForDisplayBucket(fileIndex, fieldType, 'new')
      .filter(row => !row.isAmbiguousMultiParty && isIdentityBackfillRow(row));
    const blocked = [...ambiguous, ...identityBackfill];
    if (blocked.length > 0) {
      this.pendingAmbiguousNotice = { fileIndex, fieldType, rows: blocked };
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
    return `${fileIndex}|${scope}|${row.rowIndex}`;
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
    rowIndex: row.rowIndex,
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

  draftSaveStatus(fileIndex: number): 'idle' | 'saving' | 'saved' | 'error' {
    return this.draftSaveState.get(fileIndex) ?? 'idle';
  }

  canSaveDraft(fileIndex: number): boolean {
    return this.correctionsForFile(fileIndex).length > 0
      && this.draftSaveStatus(fileIndex) !== 'saving';
  }

  saveDraft(fileIndex: number): void {
    const file = this.selectedFiles[fileIndex];
    const batchResult = this.batchResults[fileIndex];
    if (!file || !batchResult) {
      return;
    }
    const payload = this.buildDownloadPayload(fileIndex);
    const resultsJson = JSON.stringify(batchResult);
    const decisionsJson = JSON.stringify(payload);
    this.draftSaveState.set(fileIndex, 'saving');
    this.validationApi
      .saveDraft(file, batchResult.fileId, file.name, resultsJson, decisionsJson)
      .subscribe({
        next: () => {
          this.draftSaveState.set(fileIndex, 'saved');
        },
        error: () => {
          this.draftSaveState.set(fileIndex, 'error');
        }
      });
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

    const payload = this.buildDownloadPayload(fileIndex);

    const subscription = this.validationApi
      .downloadCorrected(file, payload)
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

  private buildDownloadPayload(fileIndex: number): DownloadCorrectionsPayload {
    const tenantCorrections = this.correctionsForFile(fileIndex)
      .filter(c => c.fieldType === 'Tenant')
      .flatMap(c => this.correctionTargets(c).map(target => ({
        rowIndex: c.rowIndex,
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
        rowIndex: c.rowIndex,
        originalName: c.originalName,
        correctedName: c.correctedName,
        changeType: c.changeType,
        confidence: c.confidence,
        matchSource: c.matchSource,
        appliesTo: c.appliesTo
      }));
    const parentResponse = this.batchResults[fileIndex]?.parentResponse;
    const copyTenantToParent =
      !!parentResponse?.isCopiedFromTenant && this.parentCopyConfirmed.has(fileIndex);
    return {
      fileId: this.batchResults[fileIndex].fileId,
      tenantCorrections,
      parentCorrections,
      copyTenantToParent
    };
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

  private loadDrafts(): void {
    this.draftsLoading = true;
    this.draftsError = null;
    this.validationApi.getDrafts().subscribe({
      next: (drafts) => {
        this.drafts = drafts ?? [];
        this.draftsLoading = false;
      },
      error: () => {
        this.draftsError = 'Could not load drafts.';
        this.draftsLoading = false;
      }
    });
  }

  discardDraft(fileId: string): void {
    const confirmed = window.confirm(
      'Discard this draft? Your saved decisions will be permanently removed.'
    );
    if (!confirmed) {
      return;
    }

    this.validationApi.discardDraft(fileId).subscribe({
      next: () => {
        this.loadDrafts();
        this.notify.success('Draft discarded.');
      },
      error: () => {
        this.notify.error('This draft could not be discarded.');
      }
    });
  }

  get hasInProgressDrafts(): boolean {
    return this.drafts.some(d => d.status === 'InProgress');
  }

  get inProgressDrafts(): DraftSummary[] {
    return this.drafts.filter(d => d.status === 'InProgress');
  }

  resumeDraft(fileId: string): void {
    if (this.batchResults.length > 0 || this.corrections.size > 0) {
      const confirmed = window.confirm(
        'Resume this draft? Your current unsaved file will be cleared.'
      );
      if (!confirmed) {
        return;
      }
    }

    this.validationApi.getDraft(fileId).subscribe({
      next: (detail: DraftDetail) => {
        let file: File;
        let batchResult: BatchValidationResult;
        let decisions: DownloadCorrectionsPayload;

        try {
          const byteChars = atob(detail.fileBase64);
          const bytes = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            bytes[i] = byteChars.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: detail.fileContentType });
          file = new File([blob], detail.fileName, { type: detail.fileContentType });
          batchResult = JSON.parse(detail.resultsJson) as BatchValidationResult;
          decisions = JSON.parse(detail.decisionsJson) as DownloadCorrectionsPayload;
        } catch {
          this.notify.error('This draft could not be restored.');
          return;
        }

        this.resetResultsState();
        this.selectedFiles = [file];
        this.batchResults = [batchResult];

        const skipped: string[] = [];
        for (const d of decisions.tenantCorrections) {
        const row = this.batchResults[0].response.results
          .find(r => r.rowIndex === d.rowIndex);
          if (!row) {
            skipped.push(`tenant:${d.originalName}`);
            continue;
          }
          this.setCorrection(0, 'tenant', row, {
            correctedName: d.correctedName,
            changeType: d.changeType,
            confidence: d.confidence,
            matchSource: d.matchSource
          });
        }

        for (const d of decisions.parentCorrections) {
        const row = this.batchResults[0].parentResponse?.results
          .find(r => r.rowIndex === d.rowIndex);
          if (!row) {
            skipped.push(`parent:${d.originalName}`);
            continue;
          }
          this.setCorrection(0, 'parent', row, {
            correctedName: d.correctedName,
            changeType: d.changeType,
            confidence: d.confidence,
            matchSource: d.matchSource
          });
        }

        this.clearRowsForBucketCache();
        this.autoAlignApplied = true;
        this.expandedFiles = new Set<number>([0]);
        this.activeFieldTabByFile = new Map<number, FieldType>([[0, 'tenant']]);
        this.bucketPageState = new Map<string, { pageIndex: number; pageSize: number }>();

        if (skipped.length > 0) {
          console.warn(
            `resumeDraft: ${skipped.length} saved decision(s) had no matching row`,
            skipped
          );
        }
      },
      error: () => {
        this.notify.error('This draft could not be restored.');
      }
    });
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

  trackByFileName(_index: number, result: BatchValidationResult): string {
    return result.fileName;
  }

  trackByStepLabel(_index: number, label: string): string {
    return label;
  }

  trackByHistoryId(_index: number, item: ValidationHistory): number {
    return item.id;
  }

  trackByDraftFileId(_index: number, d: DraftSummary): string {
    return d.fileId;
  }
}
