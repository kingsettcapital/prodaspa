import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
  ValidationResult
} from './models/validation.models';
import {
  BucketKey,
  FieldType,
  OverridePopoverRequest,
  ValidationRow
} from './validation-result-table.component';

type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'closed';

interface AutosaveState {
  dirty: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  maxWaitTimer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  pending: boolean;
  persisted: boolean;
  consecutiveFailures: number;
  disarmed: boolean;
  lastSavedAt: Date | null;
}

interface PendingOverride {
  fileId: string;
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

const ALL_FIELD_TYPES: readonly FieldType[] = ['tenant', 'parent'];
const ALL_BUCKET_KEYS: readonly BucketKey[] = ['new', 'flagged', 'suggested', 'excluded'];

type BulkActionType = 'apply-all' | 'accept-as-is' | 'standardise';

interface PendingBulkAction {
  type: BulkActionType;
  fileId: string;
  fieldType: FieldType;
  fieldLabel: string;
}

interface PendingAmbiguousNotice {
  fileId: string;
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
  private static readonly AUTOSAVE_DEBOUNCE_MS = 3000;
  private static readonly AUTOSAVE_MAX_WAIT_MS = 30000;
  private static readonly AUTOSAVE_FAILURE_THRESHOLD = 3;

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

  private readonly downloadTimers = new Map<string, number[]>();
  private readonly downloadSubscriptions = new Map<string, Subscription>();
  private readonly downloadGeneration = new Map<string, number>();

  selectedFiles: File[] = [];
  batchResults: BatchValidationResult[] = [];
  isLoading = false;
  errorMessage = '';
  isDragging = false;

  expandedFiles = new Set<string>();
  expandedFieldGroups = new Set<string>();
  expandedSections = new Set<string>();
  /** Active Tenant/Parent tab per file card. Not persisted to drafts. */
  activeFieldTabByFile = new Map<string, FieldType>();
  /** Page index/size per (fileId, fieldType, bucketKey). Not persisted to drafts. */
  bucketPageState = new Map<string, { pageIndex: number; pageSize: number }>();
  /** Free-text filter per file card. View-only: bulk actions ignore it. */
  searchTermByFile = new Map<string, string>();
  corrections = new Map<string, StoredCorrectionRecord>();
  downloadProgressByFile = new Map<string, DownloadChecklistState>();
  private draftSaveState = new Map<string, DraftSaveStatus>();

  private autosave = new Map<string, AutosaveState>();
  private suppressAutosaveDirty = false;
  private autosaveWarningIds = new Set<string>();
  private visibilityChangeHandler: (() => void) | null = null;

  private autoAlignApplied = false;

  readonly defaultPageSize = 50;
  readonly pageSizeOptions = [25, 50, 100];

  /** FIX 3: bump when corrections mutate so table inputs reuse stable Map/Set refs. */
  private correctionsVersion = 0;
  private readonly correctionMapCache = new Map<string, Map<string, string>>();
  private readonly correctionMapCacheVersion = new Map<string, number>();
  private readonly changeTypeMapCache = new Map<string, Map<string, CorrectionChangeType>>();
  private readonly changeTypeMapCacheVersion = new Map<string, number>();
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
    this.visibilityChangeHandler = () => this.onDocumentVisibilityChange();
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  get canValidate(): boolean {
    return this.selectedFiles.length > 0 && !this.isLoading;
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.setFiles(Array.from(files));
      input.value = '';
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
    this.selectedFiles = [...this.selectedFiles, ...files];
    this.resetResultsState();
  }

  removeSelectedFile(index: number, fileInputEl?: HTMLInputElement): void {
    this.selectedFiles = this.selectedFiles.filter((_, i) => i !== index);
    this.errorMessage = '';
    if (this.selectedFiles.length === 0 && fileInputEl) {
      fileInputEl.value = '';
    }
    this.resetResultsState();
  }

  private resetResultsState(): void {
    this.clearAllDownloadRuns();
    this.clearAllAutosaveTimers();
    this.autosave.clear();
    this.autosaveWarningIds = new Set<string>();
    this.batchResults = [];
    this.expandedFiles = new Set<string>();
    this.expandedFieldGroups = new Set<string>();
    this.parentCopyConfirmed.clear();
    this.expandedSections = new Set<string>();
    this.activeFieldTabByFile = new Map<string, FieldType>();
    this.bucketPageState = new Map<string, { pageIndex: number; pageSize: number }>();
    this.searchTermByFile = new Map<string, string>();
    this.corrections = new Map<string, StoredCorrectionRecord>();
    this.downloadProgressByFile = new Map<string, DownloadChecklistState>();
    this.draftSaveState.clear();
    this.autoAlignApplied = false;
    this.bumpCorrectionsCache();
    this.clearRowsForBucketCache();
  }

  clearBatch(fileInput?: HTMLInputElement): void {
    const persistedIds: string[] = [];
    this.batchResults.forEach(result => {
      const state = this.autosave.get(result.fileId);
      if (state?.persisted && !state.disarmed) {
        persistedIds.push(result.fileId);
      }
    });

    if (persistedIds.length > 0) {
      const confirmed = window.confirm(
        'Clear this file? Your auto-saved draft will be permanently removed.'
      );
      if (!confirmed) {
        return;
      }
    }

    this.batchResults.forEach(result => {
      const state = this.autosave.get(result.fileId);
      if (state?.persisted && !state.disarmed) {
        this.clearAutosaveTimersById(result.fileId);
        state.disarmed = true;
      }
    });

    this.resetResultsState();
    this.selectedFiles = [];
    this.errorMessage = '';
    if (fileInput) {
      fileInput.value = '';
    }

    if (persistedIds.length === 0) {
      return;
    }

    let remaining = persistedIds.length;
    const finishOne = (): void => {
      remaining--;
      if (remaining <= 0) {
        this.loadDrafts();
      }
    };
    persistedIds.forEach(fileId => {
      this.validationApi.clearDraft(fileId).subscribe({
        next: () => finishOne(),
        error: err => {
          console.warn('clearDraft failed', fileId, err);
          finishOne();
        }
      });
    });
  }

  removeValidatedFile(fileIndex: number, fileInput?: HTMLInputElement): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }

    const autosaveState = this.autosave.get(fileId);
    const hasPersistedDraft = !!autosaveState?.persisted && !autosaveState.disarmed;
    if (hasPersistedDraft) {
      const confirmed = window.confirm(
        'Remove this file? Your auto-saved draft will be permanently removed.'
      );
      if (!confirmed) {
        return;
      }
    }

    this.clearAutosaveTimersById(fileId);
    this.disarmAutosaveById(fileId);
    this.clearDownloadRunById(fileId);

    this.autosave.delete(fileId);
    this.draftSaveState.delete(fileId);
    this.downloadTimers.delete(fileId);
    this.downloadSubscriptions.delete(fileId);
    this.downloadGeneration.delete(fileId);
    this.downloadProgressByFile.delete(fileId);
    this.expandedFiles.delete(fileId);
    this.activeFieldTabByFile.delete(fileId);
    this.searchTermByFile.delete(fileId);
    this.autosaveWarningIds.delete(fileId);
    this.parentCopyConfirmed.delete(fileId);
    this.deleteKeysForFile(this.expandedFieldGroups, fileId);
    this.deleteKeysForFile(this.expandedSections, fileId);
    this.deleteKeysForFile(this.bucketPageState, fileId);
    this.deleteKeysForFile(this.corrections, fileId);
    this.deleteKeysForFile(this.correctionMapCache, fileId);
    this.deleteKeysForFile(this.correctionMapCacheVersion, fileId);
    this.deleteKeysForFile(this.changeTypeMapCache, fileId);
    this.deleteKeysForFile(this.changeTypeMapCacheVersion, fileId);
    this.deleteKeysForFile(this.acceptedKeysCache, fileId);
    this.deleteKeysForFile(this.acceptedKeysCacheVersion, fileId);
    this.deleteKeysForFile(this.rowsForBucketCache, fileId);
    this.bumpCorrectionsCache();

    if (this.pendingOverride?.fileId === fileId) {
      this.pendingOverride = null;
    }
    if (this.pendingBulkAction?.fileId === fileId) {
      this.pendingBulkAction = null;
    }
    if (this.pendingAmbiguousNotice?.fileId === fileId) {
      this.pendingAmbiguousNotice = null;
    }

    this.selectedFiles = this.selectedFiles.filter((_, i) => i !== fileIndex);
    this.batchResults = this.batchResults.filter((_, i) => i !== fileIndex);

    if (hasPersistedDraft) {
      this.validationApi.clearDraft(fileId).subscribe({
        next: () => this.loadDrafts(),
        error: err => {
          console.warn('clearDraft failed', fileId, err);
          this.loadDrafts();
        }
      });
    }

    if (this.batchResults.length === 0) {
      this.resetResultsState();
      this.selectedFiles = [];
      this.errorMessage = '';
      if (fileInput) {
        fileInput.value = '';
      }
    }
  }

  private deleteKeysForFile(store: { keys(): IterableIterator<string>; delete(key: string): unknown }, fileId: string): void {
    for (const key of Array.from(store.keys())) {
      if (this.keyBelongsToFile(key, fileId)) {
        store.delete(key);
      }
    }
  }

  private keyBelongsToFile(key: string, fileId: string): boolean {
    return key === fileId
      || key.startsWith(`${fileId}|`)
      || key.startsWith(`${fileId}-`)
      || key.startsWith(`paged|${fileId}|`)
      || key.startsWith(`searched|${fileId}|`)
      || key.startsWith(`display|${fileId}|`);
  }

  ngOnDestroy(): void {
    this.clearAllDownloadRuns();
    this.clearAllAutosaveTimers();
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
  }

  validate(): void {
    if (this.selectedFiles.length === 0 || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.resetResultsState();

    this.validationApi.validateBatch(this.selectedFiles).subscribe({
      next: (results) => {
        this.batchResults = results;
        this.autoStageAlignments();
        results.forEach((result, fileIndex) => {
          this.ensureAutosaveStateById(result.fileId);
          const state = this.autosave.get(result.fileId)!;
          state.dirty = true;
          this.flushAutosave(fileIndex);
        });
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
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    const set = new Set(this.expandedFiles);
    if (set.has(fileId)) {
      set.delete(fileId);
    } else {
      set.add(fileId);
    }
    this.expandedFiles = set;
  }

  isFileExpanded(fileIndex: number): boolean {
    const fileId = this.resolveFileId(fileIndex);
    return fileId != null && this.expandedFiles.has(fileId);
  }

  isAutosaveWarning(fileIndex: number): boolean {
    const fileId = this.resolveFileId(fileIndex);
    return fileId != null && this.autosaveWarningIds.has(fileId);
  }

  toggleFieldGroup(fileIndex: number, fieldType: FieldType, event?: Event): void {
    event?.stopPropagation();
    const key = this.fieldGroupExpandKey(fileIndex, fieldType);
    if (key == null) {
      return;
    }
    const set = new Set(this.expandedFieldGroups);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    this.expandedFieldGroups = set;
  }

  isFieldGroupExpanded(fileIndex: number, fieldType: FieldType): boolean {
    const key = this.fieldGroupExpandKey(fileIndex, fieldType);
    return key != null && this.expandedFieldGroups.has(key);
  }

  toggleSection(fileIndex: number, fieldType: FieldType, bucket: BucketKey, event?: Event): void {
    event?.stopPropagation();
    const key = this.sectionExpandKey(fileIndex, fieldType, bucket);
    if (key == null) {
      return;
    }
    const set = new Set(this.expandedSections);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    this.expandedSections = set;
  }

  isSectionExpanded(fileIndex: number, fieldType: FieldType, bucket: BucketKey): boolean {
    const key = this.sectionExpandKey(fileIndex, fieldType, bucket);
    return key != null && this.expandedSections.has(key);
  }

  hasParentResponse(fileIndex: number): boolean {
    return this.batchResults[fileIndex]?.parentResponse != null;
  }

  private parentCopyConfirmed = new Set<string>();

  isParentCopyPending(fileIndex: number): boolean {
    const pr = this.batchResults[fileIndex]?.parentResponse;
    const fileId = this.resolveFileId(fileIndex);
    return !!pr?.isCopiedFromTenant && !(fileId != null && this.parentCopyConfirmed.has(fileId));
  }

  confirmParentCopy(fileIndex: number): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.parentCopyConfirmed.add(fileId);
  }

  cancelParentCopy(fileIndex: number, event?: Event): void {
    event?.stopPropagation();
    this.setActiveFieldTab(fileIndex, 'tenant');
  }

  fieldGroupsFor(fileIndex: number): FieldGroupConfig[] {
    const groups: FieldGroupConfig[] = [
      { type: 'tenant', label: 'Tenant names', nameColumnLabel: 'Source Tenant Name' }
    ];
    if (this.hasParentResponse(fileIndex)) {
      groups.push({ type: 'parent', label: 'Parent names', nameColumnLabel: 'Source Parent Name' });
    }
    return groups;
  }

  fieldGroupConfig(fieldType: FieldType): FieldGroupConfig {
    return fieldType === 'parent'
      ? { type: 'parent', label: 'Parent names', nameColumnLabel: 'Source Parent Name' }
      : { type: 'tenant', label: 'Tenant names', nameColumnLabel: 'Source Tenant Name' };
  }

  activeFieldType(fileIndex: number): FieldType {
    const fileId = this.resolveFileId(fileIndex);
    const tab = (fileId != null ? this.activeFieldTabByFile.get(fileId) : undefined) ?? 'tenant';
    return tab === 'parent' && this.hasParentResponse(fileIndex) ? 'parent' : 'tenant';
  }

  onFieldToggleChange(fileIndex: number, event: MatButtonToggleChange): void {
    const type = event.value === 'parent' ? 'parent' : 'tenant';
    this.setActiveFieldTab(fileIndex, type);
  }

  private setActiveFieldTab(fileIndex: number, fieldType: FieldType): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    const map = new Map(this.activeFieldTabByFile);
    map.set(fileId, fieldType);
    this.activeFieldTabByFile = map;
  }

  fieldGroupRowCount(fileIndex: number, fieldType: FieldType): number {
    return this.displayBuckets.reduce(
      (sum, bucket) => sum + this.bucketCount(fileIndex, fieldType, bucket.key),
      0
    );
  }

  private fieldGroupExpandKey(fileIndex: number, fieldType: FieldType): string | null {
    const fileId = this.resolveFileId(fileIndex);
    return fileId == null ? null : `${fileId}-group-${fieldType}`;
  }

  private sectionExpandKey(fileIndex: number, fieldType: FieldType, bucket: BucketKey): string | null {
    const fileId = this.resolveFileId(fileIndex);
    return fileId == null ? null : `${fileId}-${fieldType}-${bucket}`;
  }

  private pageStateKey(fileIndex: number, fieldType: FieldType, bucket: BucketKey): string {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return `__unresolved:${fileIndex}|${fieldType}|${bucket}`;
    }
    return `${fileId}|${fieldType}|${bucket}`;
  }

  /**
   * Resolves a display-position fileIndex to the stable fileId for that file.
   * fileIndex is a positional handle only — it shifts when files are added or
   * removed. All session state (corrections, autosave, caches) is being
   * migrated to key off the returned fileId instead. Returns null when the
   * index does not resolve, matching the existing `if (!file || !batchResult)`
   * guard convention used by saveDraft / downloadFile / flushAutosave.
   */
  private resolveFileId(fileIndex: number): string | null {
    return this.batchResults[fileIndex]?.fileId ?? null;
  }

  private indexOfFileId(fileId: string): number {
    return this.batchResults.findIndex(result => result.fileId === fileId);
  }

  private locateByFileId(fileId: string): {
    fileIndex: number;
    file: File;
    batchResult: BatchValidationResult;
  } | null {
    const fileIndex = this.indexOfFileId(fileId);
    if (fileIndex < 0) {
      return null;
    }
    const file = this.selectedFiles[fileIndex];
    const batchResult = this.batchResults[fileIndex];
    if (!file || !batchResult) {
      return null;
    }
    return { fileIndex, file, batchResult };
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
    if (this.resolveFileId(fileIndex) == null) {
      return;
    }
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
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return [];
    }
    const pageIndex = this.pageIndexFor(fileIndex, fieldType, key);
    const pageSize = this.pageSizeFor(fileIndex, fieldType, key);
    const cacheKey = this.pagedRowsCacheKey(fileId, fieldType, key, pageIndex, pageSize);
    const cached = this.rowsForBucketCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const all = this.rowsForSearchedDisplayBucket(fileIndex, fieldType, key);
    const start = pageIndex * pageSize;
    const rows = all.slice(start, start + pageSize);
    this.rowsForBucketCache.set(cacheKey, rows);
    return rows;
  }

  private pagedRowsCacheKey(
    fileId: string,
    fieldType: FieldType,
    key: BucketKey,
    pageIndex: number,
    pageSize: number
  ): string {
    return `paged|${fileId}|${fieldType}|${key}|${pageIndex}|${pageSize}`;
  }

  private pagedRowsCachePrefix(fileId: string, fieldType: FieldType, bucket: BucketKey): string {
    return `paged|${fileId}|${fieldType}|${bucket}|`;
  }

  private searchedRowsCachePrefix(fileId: string, fieldType: FieldType, bucket: BucketKey): string {
    return `searched|${fileId}|${fieldType}|${bucket}|`;
  }

  private searchedRowsCacheKey(
    fileId: string,
    fieldType: FieldType,
    key: BucketKey,
    term: string
  ): string {
    return `searched|${fileId}|${fieldType}|${key}|${term}`;
  }

  private displayRowsCacheKey(fileId: string, fieldType: FieldType, key: BucketKey): string {
    return `display|${fileId}|${fieldType}|${key}`;
  }

  private bucketRowsCacheKey(fileId: string, fieldType: FieldType, bucket: BucketKey): string {
    return `${fileId}|${fieldType}|${bucket}`;
  }

  private invalidatePagedSliceCache(
    fileIndex: number,
    fieldType: FieldType,
    bucket: BucketKey
  ): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    const prefix = this.pagedRowsCachePrefix(fileId, fieldType, bucket);
    for (const key of Array.from(this.rowsForBucketCache.keys())) {
      if (key.startsWith(prefix)) {
        this.rowsForBucketCache.delete(key);
      }
    }
  }

  private invalidateSearchedSliceCache(
    fileIndex: number,
    fieldType: FieldType,
    bucket: BucketKey
  ): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    const prefix = this.searchedRowsCachePrefix(fileId, fieldType, bucket);
    for (const key of Array.from(this.rowsForBucketCache.keys())) {
      if (key.startsWith(prefix)) {
        this.rowsForBucketCache.delete(key);
      }
    }
  }

  searchTermFor(fileIndex: number): string {
    const fileId = this.resolveFileId(fileIndex);
    return (fileId != null ? this.searchTermByFile.get(fileId) : undefined) ?? '';
  }

  onSearchTermChange(fileIndex: number, term: string): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    const terms = new Map(this.searchTermByFile);
    terms.set(fileId, term ?? '');
    this.searchTermByFile = terms;

    const pages = new Map(this.bucketPageState);
    for (const fieldType of ALL_FIELD_TYPES) {
      for (const bucket of ALL_BUCKET_KEYS) {
        this.invalidatePagedSliceCache(fileIndex, fieldType, bucket);
        this.invalidateSearchedSliceCache(fileIndex, fieldType, bucket);
        pages.set(this.pageStateKey(fileIndex, fieldType, bucket), {
          pageIndex: 0,
          pageSize: this.pageSizeFor(fileIndex, fieldType, bucket)
        });
      }
    }
    this.bucketPageState = pages;
  }

  rowsForBucket(fileIndex: number, fieldType: FieldType, bucket: BucketKey): ValidationRow[] {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return [];
    }
    const cacheKey = this.bucketRowsCacheKey(fileId, fieldType, bucket);
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
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return [];
    }
    const cacheKey = this.displayRowsCacheKey(fileId, fieldType, key);
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

  /**
   * Display bucket narrowed by the card's search term. View-only: bulk actions,
   * counts and the download payload must keep calling rowsForDisplayBucket.
   */
  rowsForSearchedDisplayBucket(
    fileIndex: number,
    fieldType: FieldType,
    key: BucketKey
  ): ValidationRow[] {
    const all = this.rowsForDisplayBucket(fileIndex, fieldType, key);
    const term = this.searchTermFor(fileIndex).trim().toLowerCase();
    if (!term) {
      return all;
    }

    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return [];
    }
    const cacheKey = this.searchedRowsCacheKey(fileId, fieldType, key, term);
    const cached = this.rowsForBucketCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = all.filter(row => this.matchesSearch(row, fieldType, term));
    this.rowsForBucketCache.set(cacheKey, rows);
    return rows;
  }

  /** Matching rows across every display bucket. Mirrors fieldGroupRowCount, search-aware. */
  searchedFieldGroupRowCount(fileIndex: number, fieldType: FieldType): number {
    return this.displayBuckets.reduce(
      (sum, bucket) =>
        sum + this.rowsForSearchedDisplayBucket(fileIndex, fieldType, bucket.key).length,
      0
    );
  }

  private matchesSearch(row: ValidationRow, fieldType: FieldType, term: string): boolean {
    const needle = (term ?? '').trim().toLowerCase();
    if (!needle) {
      return true;
    }

    if ((row?.tenantName ?? '').toLowerCase().includes(needle)) {
      return true;
    }

    if (fieldType === 'tenant') {
      return ((row as ValidationResult)?.unitId ?? '').toLowerCase().includes(needle);
    }

    const appliesTo = (row as ParentValidationResult)?.appliesTo ?? [];
    return appliesTo.some(item => (item?.unit ?? '').toLowerCase().includes(needle));
  }

  private clearRowsForBucketCache(): void {
    this.rowsForBucketCache.clear();
  }

  bucketCount(fileIndex: number, fieldType: FieldType, bucket: BucketKey): number {
    return this.rowsForDisplayBucket(fileIndex, fieldType, bucket).length;
  }

  acceptedCount(fileIndex: number): number {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return 0;
    }
    const prefix = `${fileId}|`;
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

  tableChangeTypeMap(fileIndex: number, fieldType: FieldType): Map<string, CorrectionChangeType> {
    const cacheKey = this.tableCacheKey(fileIndex, fieldType);
    const cachedVersion = this.changeTypeMapCacheVersion.get(cacheKey);
    if (cachedVersion === this.correctionsVersion) {
      const cached = this.changeTypeMapCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const prefix = this.tableKeyPrefix(fileIndex, fieldType);
    const map = new Map<string, CorrectionChangeType>();
    this.corrections.forEach((record, key) => {
      if (key.startsWith(prefix)) {
        map.set(key.slice(prefix.length), record.changeType);
      }
    });
    this.changeTypeMapCache.set(cacheKey, map);
    this.changeTypeMapCacheVersion.set(cacheKey, this.correctionsVersion);
    return map;
  }

  private tableCacheKey(fileIndex: number, fieldType: FieldType): string {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return `__unresolved:${fileIndex}|${fieldType}`;
    }
    return `${fileId}|${fieldType}`;
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
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.pendingOverride = {
      fileId,
      fieldType,
      row: request.row,
      top: request.top,
      left: request.left,
      originalName: request.row.tenantName,
      initialValue: this.effectiveCorrectionValue(fileIndex, fieldType, request.row),
      placeholder: request.placeholder
    };
  }

  onOverrideSave(value: string): void {
    if (!this.pendingOverride) {
      return;
    }
    const { fileId, fieldType, row } = this.pendingOverride;
    const currentIndex = this.indexOfFileId(fileId);
    if (currentIndex < 0) {
      this.pendingOverride = null;
      return;
    }
    this.setManualCorrection(currentIndex, fieldType, row, value);
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
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return `__unresolved:${fileIndex}|${fieldType}|`;
    }
    return `${fileId}|${fieldType}|`;
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
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.pendingBulkAction = { type, fileId, fieldType, fieldLabel };
  }

  cancelBulkAction(): void {
    this.pendingBulkAction = null;
  }

  confirmBulkAction(): void {
    const pending = this.pendingBulkAction;
    if (!pending) {
      return;
    }

    const { type, fileId, fieldType } = pending;
    this.pendingBulkAction = null;
    const fileIndex = this.indexOfFileId(fileId);
    if (fileIndex < 0) {
      return;
    }

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
    return 'Ambiguous name';
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
    // Backfill identity exclusion removed on Heather's instruction (2026-09).
    // Server remains the authority via ValidationController.cs:1027-1033.
    for (const row of this.rowsForDisplayBucket(fileIndex, fieldType, 'new')) {
      if (row.isAmbiguousMultiParty) {
        continue;
      }
      this.acceptRow(fileIndex, fieldType, row);
    }

    const ambiguous = this.ambiguousNewRows(fileIndex, fieldType);
    if (ambiguous.length > 0) {
      const fileId = this.resolveFileId(fileIndex);
      if (fileId == null) {
        return;
      }
      this.pendingAmbiguousNotice = { fileId, fieldType, rows: ambiguous };
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
    if (value === this.effectiveCorrectionValue(fileIndex, fieldType, row)) {
      return;
    }
    if (!value?.trim()) {
      return;
    }
    this.setCorrection(fileIndex, fieldType, row, {
      correctedName: value.trim(),
      changeType: 'ManualOverride',
      confidence: null,
      matchSource: 'ManualOverride'
    });
  }

  private effectiveCorrectionValue(
    fileIndex: number,
    fieldType: FieldType,
    row: ValidationRow
  ): string {
    const stored = this.corrections.get(this.correctionKey(fileIndex, fieldType, row));
    return stored ? stored.correctedName : this.sourceNameForField(fieldType, row);
  }

  private sourceNameForField(fieldType: FieldType, row: ValidationRow): string {
    if (fieldType === 'parent') {
      return (row as ParentValidationResult).tenantName;
    }
    return row.tenantName;
  }

  clearCorrection(fileIndex: number, fieldType: FieldType, row: ValidationRow): void {
    const map = new Map(this.corrections);
    map.delete(this.correctionKey(fileIndex, fieldType, row));
    this.corrections = map;
    this.bumpCorrectionsCache();
    if (!this.suppressAutosaveDirty) {
      this.markAutosaveDirty(fileIndex);
    }
  }

  private correctionKey(fileIndex: number, fieldType: FieldType, row: ValidationRow): string {
    const scope = fieldType === 'tenant' ? 'tenant' : 'parent';
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return `__unresolved:${fileIndex}|${scope}|${row.rowIndex}`;
    }
    return `${fileId}|${scope}|${row.rowIndex}`;
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
    if (!this.suppressAutosaveDirty) {
      this.markAutosaveDirty(fileIndex);
    }
  }

  downloadProgress(fileIndex: number): DownloadChecklistState | undefined {
    const fileId = this.resolveFileId(fileIndex);
    return fileId != null ? this.downloadProgressByFile.get(fileId) : undefined;
  }

  isDownloadInProgress(fileIndex: number): boolean {
    return this.downloadProgress(fileIndex)?.inProgress ?? false;
  }

  draftSaveStatus(fileIndex: number): DraftSaveStatus {
    const fileId = this.resolveFileId(fileIndex);
    return (fileId != null ? this.draftSaveState.get(fileId) : undefined) ?? 'idle';
  }

  autosaveLastSavedAt(fileIndex: number): Date | null {
    const fileId = this.resolveFileId(fileIndex);
    return (fileId != null ? this.autosave.get(fileId)?.lastSavedAt : undefined) ?? null;
  }

  dismissAutosaveWarning(fileIndex: number): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null || !this.autosaveWarningIds.has(fileId)) {
      return;
    }
    const next = new Set(this.autosaveWarningIds);
    next.delete(fileId);
    this.autosaveWarningIds = next;
  }

  canSaveDraft(fileIndex: number): boolean {
    const status = this.draftSaveStatus(fileIndex);
    return !!this.batchResults[fileIndex]
      && status !== 'saving'
      && status !== 'closed';
  }

  saveDraft(fileIndex: number): void {
    const file = this.selectedFiles[fileIndex];
    const batchResult = this.batchResults[fileIndex];
    if (!file || !batchResult) {
      return;
    }
    const fileId = batchResult.fileId;
    const state = this.ensureAutosaveStateById(fileId);
    if (state.disarmed) {
      return;
    }
    const payload = this.buildDownloadPayload(fileIndex);
    const resultsJson = JSON.stringify(batchResult);
    const decisionsJson = JSON.stringify(payload);
    this.draftSaveState.set(fileId, 'saving');
    this.validationApi
      .saveDraft(file, fileId, file.name, resultsJson, decisionsJson)
      .subscribe({
        next: () => {
          state.persisted = true;
          state.consecutiveFailures = 0;
          state.lastSavedAt = new Date();
          state.dirty = false;
          this.draftSaveState.set(fileId, 'saved');
          const currentIndex = this.indexOfFileId(fileId);
          if (currentIndex >= 0) {
            this.dismissAutosaveWarning(currentIndex);
          }
          this.loadDrafts();
        },
        error: () => {
          this.draftSaveState.set(fileId, 'error');
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

    const fileId = batchResult.fileId;
    this.clearDownloadRunById(fileId);
    const generation = (this.downloadGeneration.get(fileId) ?? 0) + 1;
    this.downloadGeneration.set(fileId, generation);

    this.setDownloadProgressById(fileId, {
      steps: ['active', 'pending', 'pending'],
      activeStep: 1,
      errorMessage: null,
      inProgress: true
    });

    this.scheduleDownloadStep(fileId, generation, ValidationComponent.DOWNLOAD_STEP_MS, () => {
      const current = this.downloadProgressByFile.get(fileId);
      if (!current?.inProgress || current.steps[2] === 'done') {
        return;
      }
      this.setDownloadProgressById(fileId, {
        steps: ['done', 'active', 'pending'],
        activeStep: 2,
        errorMessage: null,
        inProgress: true
      });
    });

    this.scheduleDownloadStep(fileId, generation, ValidationComponent.DOWNLOAD_STEP_MS * 2, () => {
      const current = this.downloadProgressByFile.get(fileId);
      if (!current?.inProgress || current.steps[2] === 'done') {
        return;
      }
      this.setDownloadProgressById(fileId, {
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
          if (this.downloadGeneration.get(fileId) !== generation) {
            return;
          }
          this.clearDownloadTimersById(fileId);
          this.setDownloadProgressById(fileId, {
            steps: ['done', 'done', 'done'],
            activeStep: null,
            errorMessage: null,
            inProgress: false
          });
          this.triggerFileDownload(file, blob);
          this.downloadSubscriptions.delete(fileId);
          this.disarmAutosaveById(fileId);
        },
        error: () => {
          if (this.downloadGeneration.get(fileId) !== generation) {
            return;
          }
          this.clearDownloadTimersById(fileId);
          this.failDownloadAtActiveStepById(fileId, 'Failed to generate corrected file.');
          this.downloadSubscriptions.delete(fileId);
        }
      });

    this.downloadSubscriptions.set(fileId, subscription);
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

  private correctionsMatchingFileId(fileId: string): StoredCorrectionRecord[] {
    const prefix = `${fileId}|`;
    const list: StoredCorrectionRecord[] = [];
    this.corrections.forEach((record, key) => {
      if (key.startsWith(prefix)) {
        list.push(record);
      }
    });
    return list;
  }

  private correctionsForFile(fileIndex: number): StoredCorrectionRecord[] {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return [];
    }
    return this.correctionsMatchingFileId(fileId);
  }

  private buildDownloadPayload(fileIndex: number): DownloadCorrectionsPayload {
    const fileId = this.resolveFileId(fileIndex);
    const records = fileId == null ? [] : this.correctionsMatchingFileId(fileId);
    const tenantCorrections = records
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
    const parentCorrections = records
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
      !!parentResponse?.isCopiedFromTenant && fileId != null && this.parentCopyConfirmed.has(fileId);
    return {
      fileId: fileId ?? '',
      tenantCorrections,
      parentCorrections,
      copyTenantToParent
    };
  }

  private ensureAutosaveState(fileIndex: number): AutosaveState {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return this.createIdleAutosaveState();
    }
    return this.ensureAutosaveStateById(fileId);
  }

  private ensureAutosaveStateById(fileId: string): AutosaveState {
    let state = this.autosave.get(fileId);
    if (!state) {
      state = this.createIdleAutosaveState();
      this.autosave.set(fileId, state);
    }
    return state;
  }

  private createIdleAutosaveState(): AutosaveState {
    return {
      dirty: false,
      debounceTimer: null,
      maxWaitTimer: null,
      inFlight: false,
      pending: false,
      persisted: false,
      consecutiveFailures: 0,
      disarmed: false,
      lastSavedAt: null
    };
  }

  private markAutosaveDirty(fileIndex: number): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.markAutosaveDirtyById(fileId);
  }

  private markAutosaveDirtyById(fileId: string): void {
    const state = this.ensureAutosaveStateById(fileId);
    if (state.disarmed) {
      return;
    }
    state.dirty = true;
    if (state.debounceTimer != null) {
      clearTimeout(state.debounceTimer);
    }
    state.debounceTimer = setTimeout(
      () => this.flushAutosaveById(fileId),
      ValidationComponent.AUTOSAVE_DEBOUNCE_MS
    );
    if (state.maxWaitTimer == null) {
      state.maxWaitTimer = setTimeout(
        () => this.flushAutosaveById(fileId),
        ValidationComponent.AUTOSAVE_MAX_WAIT_MS
      );
    }
  }

  private flushAutosave(fileIndex: number): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.flushAutosaveById(fileId);
  }

  private flushAutosaveById(fileId: string): void {
    const state = this.ensureAutosaveStateById(fileId);
    this.clearAutosaveTimersById(fileId);
    if (state.disarmed || !state.dirty) {
      return;
    }
    if (state.inFlight) {
      state.pending = true;
      return;
    }

    const located = this.locateByFileId(fileId);
    if (!located) {
      return;
    }
    const { fileIndex, file, batchResult } = located;

    state.dirty = false;
    state.inFlight = true;
    this.draftSaveState.set(fileId, 'saving');

    const onSuccess = (): void => {
      state.inFlight = false;
      state.persisted = true;
      state.consecutiveFailures = 0;
      state.lastSavedAt = new Date();
      this.draftSaveState.set(fileId, 'saved');
      const currentIndex = this.indexOfFileId(fileId);
      if (currentIndex >= 0) {
        this.dismissAutosaveWarning(currentIndex);
      }
      this.loadDrafts();
      if (state.pending) {
        state.pending = false;
        this.markAutosaveDirtyById(fileId);
      }
    };

    const onFailure = (err: unknown): void => {
      const status = err instanceof HttpErrorResponse ? err.status : 0;

      if (status === 409) {
        state.inFlight = false;
        state.disarmed = true;
        this.clearAutosaveTimersById(fileId);
        this.draftSaveState.set(fileId, 'closed');
        return;
      }

      if (status === 404 && state.persisted) {
        state.persisted = false;
        state.dirty = true;
        state.inFlight = false;
        this.flushAutosaveById(fileId);
        return;
      }

      state.inFlight = false;
      state.consecutiveFailures++;
      state.dirty = true;
      this.draftSaveState.set(fileId, 'error');
      if (state.consecutiveFailures >= ValidationComponent.AUTOSAVE_FAILURE_THRESHOLD) {
        const next = new Set(this.autosaveWarningIds);
        next.add(fileId);
        this.autosaveWarningIds = next;
      }
    };

    if (!state.persisted) {
      const payload = this.buildDownloadPayload(fileIndex);
      const resultsJson = JSON.stringify(batchResult);
      const decisionsJson = JSON.stringify(payload);
      this.validationApi
        .saveDraft(file, fileId, file.name, resultsJson, decisionsJson)
        .subscribe({ next: () => onSuccess(), error: err => onFailure(err) });
      return;
    }

    this.validationApi
      .updateDraftDecisions(fileId, JSON.stringify(this.buildDownloadPayload(fileIndex)))
      .subscribe({ next: () => onSuccess(), error: err => onFailure(err) });
  }

  private disarmAutosave(fileIndex: number): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.disarmAutosaveById(fileId);
  }

  private disarmAutosaveById(fileId: string): void {
    const state = this.ensureAutosaveStateById(fileId);
    state.disarmed = true;
    this.clearAutosaveTimersById(fileId);
    this.draftSaveState.set(fileId, 'closed');
  }

  private clearAutosaveTimers(fileIndex: number): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.clearAutosaveTimersById(fileId);
  }

  private clearAutosaveTimersById(fileId: string): void {
    const state = this.autosave.get(fileId);
    if (!state) {
      return;
    }
    if (state.debounceTimer != null) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    if (state.maxWaitTimer != null) {
      clearTimeout(state.maxWaitTimer);
      state.maxWaitTimer = null;
    }
  }

  private clearAllAutosaveTimers(): void {
    this.autosave.forEach((_state, fileId) => this.clearAutosaveTimersById(fileId));
  }

  private onDocumentVisibilityChange(): void {
    if (document.visibilityState !== 'hidden') {
      return;
    }
    this.autosave.forEach((state, fileId) => {
      if (state.dirty && !state.disarmed) {
        this.flushAutosaveById(fileId);
      }
    });
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
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.setDownloadProgressById(fileId, state);
  }

  private setDownloadProgressById(fileId: string, state: DownloadChecklistState): void {
    const map = new Map(this.downloadProgressByFile);
    map.set(fileId, state);
    this.downloadProgressByFile = map;
  }

  private failDownloadAtActiveStep(fileIndex: number, message: string): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.failDownloadAtActiveStepById(fileId, message);
  }

  private failDownloadAtActiveStepById(fileId: string, message: string): void {
    const current = this.downloadProgressByFile.get(fileId);
    const activeStep = current?.activeStep ?? 3;
    const steps: [DownloadStepStatus, DownloadStepStatus, DownloadStepStatus] = current
      ? [...current.steps]
      : ['pending', 'pending', 'pending'];
    steps[activeStep - 1] = 'failed';

    this.setDownloadProgressById(fileId, {
      steps,
      activeStep: null,
      errorMessage: message,
      inProgress: false
    });
  }

  private scheduleDownloadStep(
    fileId: string,
    generation: number,
    delayMs: number,
    onFire: () => void
  ): void {
    const timerId = window.setTimeout(() => {
      if (this.downloadGeneration.get(fileId) !== generation) {
        return;
      }
      onFire();
    }, delayMs);

    const timers = this.downloadTimers.get(fileId) ?? [];
    timers.push(timerId);
    this.downloadTimers.set(fileId, timers);
  }

  private clearDownloadTimers(fileIndex: number): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.clearDownloadTimersById(fileId);
  }

  private clearDownloadTimersById(fileId: string): void {
    const timers = this.downloadTimers.get(fileId);
    if (timers) {
      timers.forEach(id => clearTimeout(id));
      this.downloadTimers.delete(fileId);
    }
  }

  private clearDownloadRun(fileIndex: number): void {
    const fileId = this.resolveFileId(fileIndex);
    if (fileId == null) {
      return;
    }
    this.clearDownloadRunById(fileId);
  }

  private clearDownloadRunById(fileId: string): void {
    this.clearDownloadTimersById(fileId);
    const existing = this.downloadSubscriptions.get(fileId);
    existing?.unsubscribe();
    this.downloadSubscriptions.delete(fileId);
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
        this.batchResults.forEach((result, fileIndex) => {
          if (result.fileId === fileId) {
            this.disarmAutosave(fileIndex);
          }
        });
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

  private matchSourceForResume(
    changeType: CorrectionChangeType,
    matchSource: MatchSource
  ): MatchSource {
    const blank = matchSource == null || String(matchSource).trim() === '';
    if (changeType === 'ManualOverride' && blank) {
      return 'ManualOverride';
    }
    return matchSource;
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
        this.suppressAutosaveDirty = true;
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
            matchSource: this.matchSourceForResume(d.changeType, d.matchSource)
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
            matchSource: this.matchSourceForResume(d.changeType, d.matchSource)
          });
        }
        this.suppressAutosaveDirty = false;

        this.clearRowsForBucketCache();
        this.autoAlignApplied = true;
        const resumedId = this.batchResults[0]?.fileId ?? batchResult.fileId;
        const resumed = this.ensureAutosaveStateById(resumedId);
        resumed.persisted = true;
        resumed.dirty = false;
        resumed.inFlight = false;
        resumed.pending = false;
        resumed.consecutiveFailures = 0;
        resumed.disarmed = false;
        resumed.lastSavedAt = detail.savedAt ? new Date(detail.savedAt) : null;
        this.draftSaveState.set(resumedId, 'saved');
        this.expandedFiles = new Set<string>([batchResult.fileId]);
        this.activeFieldTabByFile = new Map<string, FieldType>([[batchResult.fileId, 'tenant']]);
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
