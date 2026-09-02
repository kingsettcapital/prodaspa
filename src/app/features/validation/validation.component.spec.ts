import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonToggleChange } from '@angular/material/button-toggle';
import { PageEvent } from '@angular/material/paginator';
import { of } from 'rxjs';
import { NotificationService } from 'src/app/core/services/notification.service';
import { SharedModule } from 'src/app/shared/shared.module';
import {
  BatchValidationResult,
  ParentValidationResponse,
  ParentValidationResult,
  ValidationResult
} from './models/validation.models';
import { ValidationApiService } from './services/validation-api.service';
import { OverridePopoverPanelComponent } from './override-popover-panel.component';
import { BucketKey, ValidationResultTableComponent } from './validation-result-table.component';
import { ValidationComponent } from './validation.component';

function makeRow(tenantName: string, suggestion: string): ValidationResult {
  return {
    rowIndex: 0,
    propertyId: 'P-1',
    unitId: 'U-1',
    tenantName,
    targetName: suggestion,
    buildingName: 'Building 1',
    leaseStart: '2024-01-01',
    status: 'suggested',
    classifyStatus: 'suggested',
    suggestion,
    matchSource: 'MasterList',
    suggestedName: suggestion,
    confidence: 0.9,
    reason: 'suggested',
    appliesTo: [{ building: 'Building 1', unit: 'U-1' }]
  };
}

function makeBatch(
  fileId: string,
  fileName: string,
  row: ValidationResult,
  parentResponse: ParentValidationResponse | null = null
): BatchValidationResult {
  return {
    fileName,
    fileId,
    historyId: 1,
    response: {
      total: 1,
      excluded: 0,
      suggested: 1,
      flagged: 0,
      new: 0,
      results: [row]
    },
    parentResponse
  };
}

function copiedParentResponse(): ParentValidationResponse {
  return {
    total: 0,
    excluded: 0,
    suggested: 0,
    flagged: 0,
    new: 0,
    isCopiedFromTenant: true,
    results: []
  };
}

function makeParentNewRow(
  tenantName: string,
  rowIndex: number,
  overrides: Partial<ParentValidationResult> = {}
): ParentValidationResult {
  return {
    rowIndex,
    propertyId: 'P-1',
    unitId: 'U-1',
    tenantName,
    targetName: '',
    buildingName: 'Building 1',
    leaseStart: '2024-01-01',
    status: 'new',
    classifyStatus: 'new',
    suggestion: null,
    matchSource: null,
    suggestedName: null,
    confidence: null,
    reason: 'New Parent Name',
    appliesTo: [{ building: 'Building 1', unit: 'U-1' }],
    ...overrides
  };
}

describe('ValidationComponent positional fileIndex keying', () => {
  const rowA = makeRow('Tenant A', 'Corrected A');
  const rowB = makeRow('Tenant B', 'Corrected B');

  let component: ValidationComponent;

  beforeEach(() => {
    const apiStub = {
      getDrafts: () => of([]),
      saveDraft: () => of({ fileId: '', id: 0, status: 'ok' }),
      updateDraftDecisions: () => of({ fileId: '', status: 'ok' }),
      clearDraft: () => of({ fileId: '', status: 'ok' })
    } as unknown as ValidationApiService;

    const notifyStub = {
      success: () => undefined,
      error: () => undefined,
      info: () => undefined
    } as unknown as NotificationService;

    component = new ValidationComponent(apiStub, notifyStub);
    (component as any).suppressAutosaveDirty = true;

    component.selectedFiles = [
      new File([], 'A.xlsx'),
      new File([], 'B.xlsx')
    ];
    component.batchResults = [
      makeBatch('file-aaa', 'A.xlsx', rowA),
      makeBatch('file-bbb', 'B.xlsx', rowB)
    ];
  });

  afterEach(() => {
    (component as any).clearAllAutosaveTimers();
  });

  it('baseline: buildDownloadPayload attributes corrections by current fileIndex', () => {
    component.acceptRow(0, 'tenant', rowA);
    component.acceptRow(1, 'tenant', rowB);

    const payloadA = (component as any).buildDownloadPayload(0);
    expect(payloadA.fileId).toBe('file-aaa');
    expect(payloadA.tenantCorrections.length).toBe(1);
    expect(payloadA.tenantCorrections[0].originalName).toBe('Tenant A');
    expect(payloadA.tenantCorrections[0].correctedName).toBe('Corrected A');

    const payloadB = (component as any).buildDownloadPayload(1);
    expect(payloadB.fileId).toBe('file-bbb');
    expect(payloadB.tenantCorrections.length).toBe(1);
    expect(payloadB.tenantCorrections[0].originalName).toBe('Tenant B');
    expect(payloadB.tenantCorrections[0].correctedName).toBe('Corrected B');
  });

  it('defect: after removing file 0, index 0 payload keeps file A corrections under file B id', () => {
    component.acceptRow(0, 'tenant', rowA);
    component.acceptRow(1, 'tenant', rowB);

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    const payload = (component as any).buildDownloadPayload(0);
    expect(payload.fileId).toBe('file-bbb');
    expect(payload.tenantCorrections.length).toBe(1);
    expect(payload.tenantCorrections[0].originalName)
      .withContext('download payload corrections must follow the file fileId, not its array position')
      .toBe('Tenant B');
    expect(payload.tenantCorrections[0].correctedName).toBe('Corrected B');
  });

  it('defect: after removing file 0, parentCopyConfirmed stays on the old index', () => {
    component.batchResults[1] = makeBatch('file-bbb', 'B.xlsx', rowB, copiedParentResponse());
    component.confirmParentCopy(1);

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    const payload = (component as any).buildDownloadPayload(0);
    expect(payload.fileId).toBe('file-bbb');
    expect(payload.copyTenantToParent)
      .withContext('parent-copy confirmation must follow the file fileId, not its array position')
      .toBe(true);
  });

  it('search term must follow the file\'s fileId, not its array position', () => {
    component.onSearchTermChange(1, 'beta-filter');

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    expect(component.searchTermFor(0))
      .withContext('search term must follow the file\'s fileId, not its array position')
      .toBe('beta-filter');
  });

  it('expanded state must follow the file\'s fileId, not its array position', () => {
    component.toggleFile(1);
    expect(component.isFileExpanded(1)).toBe(true);

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    expect(component.isFileExpanded(0))
      .withContext('expanded state must follow the file\'s fileId, not its array position')
      .toBe(true);
  });

  it('active field tab must follow the file\'s fileId, not its array position', () => {
    component.batchResults[1] = makeBatch('file-bbb', 'B.xlsx', rowB, copiedParentResponse());
    component.onFieldToggleChange(1, { value: 'parent' } as MatButtonToggleChange);
    expect(component.activeFieldType(1)).toBe('parent');

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    expect(component.activeFieldType(0))
      .withContext('active field tab must follow the file\'s fileId, not its array position')
      .toBe('parent');
  });

  it('autosaveWarning (no public add) must follow the file\'s fileId, not its array position', () => {
    (component as any).autosaveWarningIds.add('file-bbb');

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    expect(component.isAutosaveWarning(0))
      .withContext('autosave warning must follow the file\'s fileId, not its array position')
      .toBe(true);
  });

  it('bucket page index must follow the file\'s fileId, not its array position', () => {
    component.onBucketPage(1, 'tenant', 'suggested', {
      pageIndex: 2,
      pageSize: 25,
      length: 100
    } as PageEvent);

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    expect(component.pageIndexFor(0, 'tenant', 'suggested'))
      .withContext('bucket page index must follow the file\'s fileId, not its array position')
      .toBe(2);
  });

  it('autosave state must follow the file\'s fileId, not its array position', () => {
    (component as any).suppressAutosaveDirty = false;
    (component as any).markAutosaveDirty(1);

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    expect((component as any).autosave.get('file-bbb')?.dirty)
      .withContext('autosave dirty state must follow the file\'s fileId, not its array position')
      .toBe(true);
  });

  it('draftSaveState must follow the file\'s fileId, not its array position', () => {
    (component as any).draftSaveState.set('file-bbb', 'saved');

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    expect(component.draftSaveStatus(0))
      .withContext('draft save status must follow the file\'s fileId, not its array position')
      .toBe('saved');
  });

  it('pendingOverride must follow the file\'s fileId, not its array position', () => {
    component.onTableOverrideRequest(1, 'tenant', {
      row: rowB,
      top: 10,
      left: 20,
      placeholder: 'Corrected name'
    });

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    expect(component.pendingOverride?.fileId)
      .withContext('pending override must follow the file\'s fileId, not its array position')
      .toBe('file-bbb');
  });

  it('pending autosave debounce must flush file B after splice, not the removed file', fakeAsync(() => {
    const saveDraft = spyOn((component as any).validationApi, 'saveDraft')
      .and.returnValue(of({ fileId: '', id: 0, status: 'ok' }));
    const updateDraftDecisions = spyOn((component as any).validationApi, 'updateDraftDecisions')
      .and.returnValue(of({ fileId: '', status: 'ok' }));

    (component as any).suppressAutosaveDirty = false;
    (component as any).markAutosaveDirty(1);

    (component as any).selectedFiles.splice(0, 1);
    (component as any).batchResults.splice(0, 1);

    tick((ValidationComponent as any).AUTOSAVE_DEBOUNCE_MS);

    const saveDraftIds = saveDraft.calls.allArgs().map(args => args[1] as string);
    const updateIds = updateDraftDecisions.calls.allArgs().map(args => args[0] as string);

    expect(saveDraftIds.includes('file-bbb') || updateIds.includes('file-bbb'))
      .withContext('debounce flush must send file-bbb (file B), not the removed file')
      .toBe(true);
    expect(saveDraftIds.includes('file-aaa') || updateIds.includes('file-aaa'))
      .withContext('debounce flush must not send file-aaa after that file was removed')
      .toBe(false);
  }));

  it('removeValidatedFile drops the file and keeps the survivor\'s corrections on its own fileId', () => {
    component.acceptRow(0, 'tenant', rowA);
    component.acceptRow(1, 'tenant', rowB);

    component.removeValidatedFile(0);

    expect(component.batchResults.map(r => r.fileId)).toEqual(['file-bbb']);
    expect(component.selectedFiles.map(f => f.name)).toEqual(['B.xlsx']);

    const payload = (component as any).buildDownloadPayload(0);
    expect(payload.fileId).toBe('file-bbb');
    expect(payload.tenantCorrections.length).toBe(1);
    expect(payload.tenantCorrections[0].originalName)
      .withContext('surviving file B must keep Tenant B corrections under file-bbb')
      .toBe('Tenant B');
  });

  it('removeValidatedFile deletes the removed file\'s corrections so they are not orphaned', () => {
    component.acceptRow(0, 'tenant', rowA);
    component.acceptRow(1, 'tenant', rowB);

    component.removeValidatedFile(0);

    const keys: string[] = Array.from((component as any).corrections.keys());
    expect(keys.some(k => k.startsWith('file-aaa|')))
      .withContext('removed file-aaa corrections must be gone from the corrections map')
      .toBe(false);
    expect(keys.some(k => k.startsWith('file-bbb|')))
      .withContext('file-bbb corrections must remain after removing file A')
      .toBe(true);
  });

  it('removeValidatedFile clears the removed file\'s display and autosave maps', () => {
    component.batchResults[0] = makeBatch('file-aaa', 'A.xlsx', rowA, copiedParentResponse());
    component.onSearchTermChange(0, 'alpha-filter');
    component.toggleFile(0);
    component.confirmParentCopy(0);
    (component as any).draftSaveState.set('file-aaa', 'saved');
    (component as any).markAutosaveDirty(0);

    component.removeValidatedFile(0);

    expect((component as any).autosave.get('file-aaa'))
      .withContext('removed file autosave state must be cleared')
      .toBeUndefined();
    expect((component as any).draftSaveState.get('file-aaa'))
      .withContext('removed file draftSaveState must be cleared')
      .toBeUndefined();
    expect((component as any).searchTermByFile.get('file-aaa'))
      .withContext('removed file search term must be cleared')
      .toBeUndefined();
    expect(component.expandedFiles.has('file-aaa'))
      .withContext('removed file expandedFiles entry must be cleared')
      .toBe(false);
    expect((component as any).parentCopyConfirmed.has('file-aaa'))
      .withContext('removed file parentCopyConfirmed entry must be cleared')
      .toBe(false);
  });

  it('removeValidatedFile cancels a pending autosave debounce for the removed file', fakeAsync(() => {
    const saveDraft = spyOn((component as any).validationApi, 'saveDraft')
      .and.returnValue(of({ fileId: '', id: 0, status: 'ok' }));
    const updateDraftDecisions = spyOn((component as any).validationApi, 'updateDraftDecisions')
      .and.returnValue(of({ fileId: '', status: 'ok' }));

    (component as any).suppressAutosaveDirty = false;
    (component as any).markAutosaveDirty(0);

    component.removeValidatedFile(0);

    tick((ValidationComponent as any).AUTOSAVE_DEBOUNCE_MS);

    const saveDraftIds = saveDraft.calls.allArgs().map(args => args[1] as string);
    const updateIds = updateDraftDecisions.calls.allArgs().map(args => args[0] as string);
    expect(saveDraftIds.includes('file-aaa') || updateIds.includes('file-aaa'))
      .withContext('removed file must not receive a debounce save after removal')
      .toBe(false);
  }));

  it('removeValidatedFile of the last file leaves batch and per-file state empty', () => {
    component.acceptRow(0, 'tenant', rowA);
    component.removeValidatedFile(1);
    component.removeValidatedFile(0);

    expect(component.batchResults.length)
      .withContext('removing the last file must leave batchResults empty')
      .toBe(0);
    expect(component.selectedFiles.length).toBe(0);
    expect((component as any).corrections.size)
      .withContext('all per-file corrections must be empty after the last file is removed')
      .toBe(0);
    expect((component as any).autosave.size).toBe(0);
    expect((component as any).draftSaveState.size).toBe(0);
    expect((component as any).searchTermByFile.size).toBe(0);
    expect(component.expandedFiles.size).toBe(0);
    expect((component as any).parentCopyConfirmed.size).toBe(0);
  });

  it('onFilesSelected resets the native input so the same file can be re-picked', () => {
    component.selectedFiles = [];
    const input: { files: File[]; value: string } = {
      files: [new File([], 'A.xlsx')],
      value: 'C:\\fakepath\\A.xlsx'
    };

    component.onFilesSelected({ target: input } as unknown as Event);

    expect(component.selectedFiles.length).toBe(1);
    expect(input.value)
      .withContext('file input must be reset so re-picking the same file fires change')
      .toBe('');
  });

  function seedAcceptAsIsParentBatch(): {
    backfilled: ParentValidationResult;
    ordinary: ParentValidationResult;
    ambiguous: ParentValidationResult;
  } {
    const backfilled = makeParentNewRow('Backfill Co', 10, {
      isBackfilledFromTenant: true,
      suggestion: null
    });
    const ordinary = makeParentNewRow('Ordinary Co', 11, {
      isBackfilledFromTenant: false,
      isAmbiguousMultiParty: false
    });
    const ambiguous = makeParentNewRow('Ambiguous Co', 12, {
      isAmbiguousMultiParty: true,
      isBackfilledFromTenant: false
    });
    component.batchResults = [
      makeBatch('file-aaa', 'A.xlsx', rowA, {
        total: 3,
        excluded: 0,
        suggested: 0,
        flagged: 0,
        new: 3,
        results: [backfilled, ordinary, ambiguous]
      })
    ];
    return { backfilled, ordinary, ambiguous };
  }

  it('T11: accept-all-as-is stages backfilled identity and ordinary parent rows, not ambiguous', () => {
    const { backfilled, ordinary, ambiguous } = seedAcceptAsIsParentBatch();

    (component as any).executeAcceptAllAsIs(0, 'parent');

    const corrections = (component as any).corrections as Map<string, { originalName: string }>;
    const stagedNames = Array.from(corrections.values()).map(c => c.originalName);
    expect(stagedNames)
      .withContext('backfilled identity parent must be staged by accept-all-as-is')
      .toContain(backfilled.tenantName);
    expect(stagedNames)
      .withContext('ordinary new parent must be staged by accept-all-as-is')
      .toContain(ordinary.tenantName);
    expect(stagedNames)
      .withContext('ambiguous multi-party parent must not be staged by accept-all-as-is')
      .not.toContain(ambiguous.tenantName);
  });

  it('T12: acceptAsIsEligibleCount includes backfilled identity and excludes ambiguous', () => {
    seedAcceptAsIsParentBatch();

    expect(component.acceptAsIsEligibleCount(0, 'parent'))
      .withContext('eligible count must include the backfilled row and exclude the ambiguous row')
      .toBe(2);
  });

  it('T13: noticeReason for an ambiguous row on the built notice is Ambiguous name', () => {
    seedAcceptAsIsParentBatch();
    (component as any).executeAcceptAllAsIs(0, 'parent');

    const noticed = component.pendingAmbiguousNotice?.rows[0];
    expect(noticed)
      .withContext('accept-all-as-is must build a notice that includes the ambiguous row')
      .toBeDefined();
    expect(component.noticeReason(noticed as ParentValidationResult))
      .withContext('notice reason must be Ambiguous name')
      .toBe('Ambiguous name');
  });
});

function apiAndNotifyStubs(): {
  apiStub: ValidationApiService;
  notifyStub: NotificationService;
} {
  const apiStub = {
    getDrafts: () => of([]),
    saveDraft: () => of({ fileId: '', id: 0, status: 'ok' }),
    updateDraftDecisions: () => of({ fileId: '', status: 'ok' }),
    clearDraft: () => of({ fileId: '', status: 'ok' }),
    validateBatch: () => of([])
  } as unknown as ValidationApiService;

  const notifyStub = {
    success: () => undefined,
    error: () => undefined,
    info: () => undefined
  } as unknown as NotificationService;

  return { apiStub, notifyStub };
}

function characterizationRow(
  rowIndex: number,
  tenantName: string,
  status: string,
  extras: Partial<ValidationResult> = {}
): ValidationResult {
  return {
    rowIndex,
    propertyId: 'P-1',
    unitId: `U-${rowIndex}`,
    tenantName,
    targetName: extras.suggestion ?? extras.suggestedName ?? '',
    buildingName: 'Building 1',
    leaseStart: '2024-01-01',
    status: status as ValidationResult['status'],
    classifyStatus: 'new',
    suggestion: extras.suggestion ?? null,
    matchSource: extras.matchSource ?? null,
    suggestedName: extras.suggestedName ?? extras.suggestion ?? null,
    confidence: extras.confidence ?? 0.9,
    reason: extras.reason ?? status,
    appliesTo: [{ building: 'Building 1', unit: `U-${rowIndex}` }],
    ...extras
  };
}

describe('ValidationComponent characterization (Phase 1c)', () => {
  let component: ValidationComponent;
  let fixture: ComponentFixture<ValidationComponent>;

  beforeEach(async () => {
    const { apiStub, notifyStub } = apiAndNotifyStubs();
    await TestBed.configureTestingModule({
      declarations: [
        ValidationComponent,
        ValidationResultTableComponent,
        OverridePopoverPanelComponent
      ],
      imports: [SharedModule, NoopAnimationsModule],
      providers: [
        { provide: ValidationApiService, useValue: apiStub },
        { provide: NotificationService, useValue: notifyStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ValidationComponent);
    component = fixture.componentInstance;
    (component as any).suppressAutosaveDirty = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function seedTenantResults(rows: ValidationResult[]): void {
    component.selectedFiles = [new File([], 'char.xlsx')];
    component.batchResults = [
      {
        fileName: 'char.xlsx',
        fileId: 'file-char',
        historyId: 1,
        response: {
          total: rows.length,
          excluded: rows.filter(r => r.status === 'excluded').length,
          suggested: rows.filter(r => r.status === 'suggested').length,
          flagged: rows.filter(r => r.status === 'flagged').length,
          new: rows.filter(r => r.status === 'new').length,
          results: rows
        },
        parentResponse: null
      }
    ];
  }

  function displayBucketKeys(): BucketKey[] {
    return component.displayBuckets.map(b => b.key);
  }

  function namesInDisplayBuckets(): string[] {
    return displayBucketKeys().flatMap(key =>
      component.rowsForDisplayBucket(0, 'tenant', key).map(r => r.tenantName)
    );
  }

  function sumDisplayBucketLengths(): number {
    return displayBucketKeys().reduce(
      (sum, key) => sum + component.rowsForDisplayBucket(0, 'tenant', key).length,
      0
    );
  }

  function expandFileAndDisplaySections(): void {
    if (!component.isFileExpanded(0)) {
      component.toggleFile(0);
    }
    for (const bucket of component.displayBuckets) {
      if (!component.isSectionExpanded(0, 'tenant', bucket.key)) {
        component.toggleSection(0, 'tenant', bucket.key);
      }
    }
    fixture.detectChanges();
  }

  function stagedOriginalNames(): string[] {
    return Array.from(
      ((component as any).corrections as Map<string, { originalName: string }>).values()
    ).map(c => c.originalName);
  }

  function clickBulk(type: 'apply-all' | 'accept-as-is' | 'standardise'): void {
    component.requestBulkAction(type, 0, 'tenant', 'Tenant names', new Event('click'));
    component.confirmBulkAction();
  }

  // This test documents a defect and is expected to be INVERTED in a later phase.
  it('CHARACTERIZATION_unrecognisedStatus_isSilentlyDropped', () => {
    const recognised = [
      characterizationRow(1, 'Name New', 'new'),
      characterizationRow(2, 'Name Suggested', 'suggested', { suggestion: 'Canonical Suggested' }),
      characterizationRow(3, 'Name Flagged', 'flagged', {
        suggestion: 'Canonical Flagged',
        reason: 'Standardisation'
      }),
      characterizationRow(4, 'Name Excluded', 'excluded')
    ];
    const dropped = characterizationRow(99, 'Name Unrecognised', '__no_such_status__');
    seedTenantResults([...recognised, dropped]);
    expandFileAndDisplaySections();

    const renderedNames = namesInDisplayBuckets();
    expect(renderedNames)
      .withContext('unrecognised status must appear in no display bucket the template binds')
      .not.toContain('Name Unrecognised');
    expect(fixture.nativeElement.textContent)
      .withContext('unrecognised tenant name must not appear in the expanded template')
      .not.toContain('Name Unrecognised');

    for (const key of displayBucketKeys()) {
      expect(component.bucketCount(0, 'tenant', key))
        .withContext(`header count for ${key} must equal the display-bucket length`)
        .toBe(component.rowsForDisplayBucket(0, 'tenant', key).length);
    }
    expect(namesInDisplayBuckets())
      .withContext('header-backed display arrays must not include the unrecognised row')
      .not.toContain('Name Unrecognised');

    expect(sumDisplayBucketLengths())
      .withContext('sum of rendered bucket lengths must be less than the response row count')
      .toBeLessThan(component.batchResults[0].response.results.length);
    expect(sumDisplayBucketLengths()).toBe(recognised.length);
  });

  it('CHARACTERIZATION_vacantRow_isOmittedFromDisplayAndCount', () => {
    const visible = characterizationRow(1, 'Occupied New Co', 'new');
    const vacantByName = characterizationRow(2, 'VACANT', 'new', { reason: 'New Tenant' });
    const vacantByReason = characterizationRow(3, 'Blank Tenant Co', 'new', {
      reason: 'blank / vacant'
    });
    seedTenantResults([visible, vacantByName, vacantByReason]);
    expandFileAndDisplaySections();

    const newNames = component.rowsForDisplayBucket(0, 'tenant', 'new').map(r => r.tenantName);
    expect(newNames).toEqual(['Occupied New Co']);
    expect(component.bucketCount(0, 'tenant', 'new')).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Occupied New Co');
    expect(fixture.nativeElement.textContent).not.toContain('VACANT');
    expect(fixture.nativeElement.textContent).not.toContain('Blank Tenant Co');
  });

  it('CHARACTERIZATION_statusVocabulary_eachComparedStatusLandsInABucket', () => {
    // Derived from live comparisons, not a believed list:
    // rowsForBucket r.status === bucket for 'new'|'flagged'|'suggested'|'excluded'
    // (validation.component.ts:844/848); display fold key === 'suggested' (876-879);
    // isAcceptAsIsRow status?.toLowerCase() === 'new' (1113);
    // template bucket.key === 'suggested'|'new' (html:275, 289).
    const derivedStatusVocabulary = ['new', 'suggested', 'flagged', 'excluded'] as const;
    const rows = [
      characterizationRow(1, 'Vocab New', 'new'),
      characterizationRow(2, 'Vocab Suggested', 'suggested', { suggestion: 'Canon Suggested' }),
      characterizationRow(3, 'Vocab Flagged', 'flagged', {
        suggestion: 'Canon Flagged',
        reason: 'Standardisation'
      }),
      characterizationRow(4, 'Vocab Excluded', 'excluded')
    ];
    seedTenantResults(rows);

    const landing: Record<string, string[]> = {};
    for (const status of derivedStatusVocabulary) {
      const name = rows.find(r => r.status === status)!.tenantName;
      landing[status] = displayBucketKeys().filter(key =>
        component.rowsForDisplayBucket(0, 'tenant', key).some(r => r.tenantName === name)
      );
      expect(landing[status].length)
        .withContext(`${status} must land in at least one display bucket`)
        .toBeGreaterThan(0);
    }

    expect(landing['new']).toEqual(['new']);
    expect(landing['suggested']).toEqual(['suggested']);
    expect(landing['flagged']).toEqual(['suggested']);
    expect(landing['excluded']).toEqual(['excluded']);
  });

  it('CHARACTERIZATION_bulkActions_operateOnFullSetNotSearchFiltered', () => {
    const alphaNew = characterizationRow(1, 'Alpha New Co', 'new');
    const zetaNew = characterizationRow(2, 'Zeta New Co', 'new');
    const alphaSuggested = characterizationRow(3, 'Alpha Suggested Co', 'suggested', {
      suggestion: 'Alpha Suggested Canonical'
    });
    const zetaSuggested = characterizationRow(4, 'Zeta Suggested Co', 'suggested', {
      suggestion: 'Zeta Suggested Canonical'
    });
    const alphaFlagged = characterizationRow(5, 'Alpha Flagged Co', 'flagged', {
      suggestion: 'Alpha Flagged Canonical',
      reason: 'Standardisation'
    });
    const zetaFlagged = characterizationRow(6, 'Zeta Flagged Co', 'flagged', {
      suggestion: 'Zeta Flagged Canonical',
      reason: 'Standardisation'
    });
    seedTenantResults([
      alphaNew,
      zetaNew,
      alphaSuggested,
      zetaSuggested,
      alphaFlagged,
      zetaFlagged
    ]);

    component.onSearchTermChange(0, 'Alpha');

    const searchedSuggested = component
      .rowsForSearchedDisplayBucket(0, 'tenant', 'suggested')
      .map(r => r.tenantName);
    const fullSuggested = component
      .rowsForDisplayBucket(0, 'tenant', 'suggested')
      .map(r => r.tenantName);
    const searchedNew = component
      .rowsForSearchedDisplayBucket(0, 'tenant', 'new')
      .map(r => r.tenantName);
    const fullNew = component.rowsForDisplayBucket(0, 'tenant', 'new').map(r => r.tenantName);

    expect(searchedSuggested.length).toBeLessThan(fullSuggested.length);
    expect(searchedNew.length).toBeLessThan(fullNew.length);
    expect(searchedSuggested).not.toContain('Zeta Suggested Co');
    expect(searchedNew).not.toContain('Zeta New Co');

    clickBulk('apply-all');
    clickBulk('accept-as-is');
    clickBulk('standardise');

    const staged = stagedOriginalNames();
    expect(staged)
      .withContext('apply-all reads rowsForDisplayBucket suggested, not the search slice')
      .toContain('Zeta Suggested Co');
    expect(staged)
      .withContext('accept-as-is reads rowsForDisplayBucket new, not the search slice')
      .toContain('Zeta New Co');
    expect(staged)
      .withContext('standardise reads rowsForBucket flagged, not the search slice')
      .toContain('Zeta Flagged Co');
  });
});

