import { Component, OnDestroy } from '@angular/core';
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
import { BucketKey, FieldType, ValidationRow } from './validation-result-table.component';

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

  private readonly downloadTimers = new Map<number, number[]>();
  private readonly downloadSubscriptions = new Map<number, Subscription>();
  private readonly downloadGeneration = new Map<number, number>();

  selectedFiles: File[] = [];
  batchResults: BatchValidationResult[] = [];
  isLoading = false;
  errorMessage = '';
  isDragging = false;

  expandedFiles = new Set<number>();
  expandedFieldGroups = new Set<string>();
  expandedSections = new Set<string>();
  corrections = new Map<string, StoredCorrectionRecord>();
  downloadProgressByFile = new Map<number, DownloadChecklistState>();

  showHistory = false;
  history: ValidationHistory[] = [];
  historyLoading = false;
  historyError = '';

  readonly downloadStepLabels = [
    'Applying your corrections',
    'Saving validated names to database',
    'Generating corrected Excel file'
  ] as const;

  readonly statusBuckets: StatusBucketConfig[] = [
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

    this.validationApi.validateBatch(this.selectedFiles).subscribe({
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
    const result = this.batchResults[fileIndex];
    if (!result) {
      return [];
    }
    if (fieldType === 'tenant') {
      return result.response.results.filter(r => r.status === bucket);
    }
    if (!result.parentResponse) {
      return [];
    }
    return result.parentResponse.results.filter(r => r.status === bucket);
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
    const prefix = this.tableKeyPrefix(fileIndex, fieldType);
    const keys = new Set<string>();
    this.corrections.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keys.add(key.slice(prefix.length));
      }
    });
    return keys;
  }

  tableCorrectionMap(fileIndex: number, fieldType: FieldType): Map<string, string> {
    const prefix = this.tableKeyPrefix(fileIndex, fieldType);
    const map = new Map<string, string>();
    this.corrections.forEach((record, key) => {
      if (key.startsWith(prefix)) {
        map.set(key.slice(prefix.length), record.correctedName);
      }
    });
    return map;
  }

  onTableAccept(fileIndex: number, fieldType: FieldType, row: ValidationRow): void {
    this.acceptRow(fileIndex, fieldType, row);
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
    return row.status === 'flagged' && row.reason === 'No suggestion';
  }

  applyAllSuggestions(fileIndex: number, fieldType: FieldType, event: Event): void {
    event.stopPropagation();
    for (const row of this.rowsForBucket(fileIndex, fieldType, 'suggested')) {
      if (this.hasSuggestion(row)) {
        this.acceptRow(fileIndex, fieldType, row);
      }
    }
  }

  standardiseAll(fileIndex: number, fieldType: FieldType, event: Event): void {
    event.stopPropagation();
    for (const row of this.rowsForBucket(fileIndex, fieldType, 'flagged')) {
      if (row.reason === 'Standardisation') {
        this.acceptRow(fileIndex, fieldType, row);
      }
    }
  }

  acceptAsIsEligibleCount(fileIndex: number, fieldType: FieldType): number {
    return this.rowsForBucket(fileIndex, fieldType, 'flagged').filter(row =>
      this.isAcceptAsIsRow(row)
    ).length;
  }

  acceptAllAsIs(fileIndex: number, fieldType: FieldType, event: Event): void {
    event.stopPropagation();
    for (const row of this.rowsForBucket(fileIndex, fieldType, 'flagged')) {
      if (this.isAcceptAsIsRow(row)) {
        this.acceptRow(fileIndex, fieldType, row);
      }
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
  }

  private correctionKey(fileIndex: number, fieldType: FieldType, row: ValidationRow): string {
    if (fieldType === 'tenant') {
      const t = row as ValidationResult;
      return `${fileIndex}|tenant|${t.unitId}|${t.tenantName}`;
    }
    return `${fileIndex}|parent|${row.tenantName}`;
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
      unitId: fieldType === 'tenant' ? (row as ValidationResult).unitId : '',
      building: fieldType === 'tenant' ? (row as ValidationResult).buildingName : '',
      appliesTo: fieldType === 'parent' ? (row as ParentValidationResult).appliesTo ?? [] : []
    };
    map.set(this.correctionKey(fileIndex, fieldType, row), record);
    this.corrections = map;
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
      .map(c => ({
        unitId: c.unitId,
        building: c.building,
        originalName: c.originalName,
        correctedName: c.correctedName,
        changeType: c.changeType,
        confidence: c.confidence,
        matchSource: c.matchSource
      }));

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
