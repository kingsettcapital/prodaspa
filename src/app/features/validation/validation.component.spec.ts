import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonToggleChange } from '@angular/material/button-toggle';
import { PageEvent } from '@angular/material/paginator';
import { of } from 'rxjs';
import { NotificationService } from 'src/app/core/services/notification.service';
import { SharedModule } from 'src/app/shared/shared.module';
import {
  BatchValidationResult,
  ClosedDealsMappedRow,
  ClosedDealsValidationGroup,
  ClosedDealsValidationResponse,
  ParentValidationResponse,
  ParentValidationResult,
  ValidationResult
} from './models/validation.models';
import { ValidationApiService } from './services/validation-api.service';
import { OverridePopoverPanelComponent } from './override-popover-panel.component';
import {
  BucketKey,
  FIELD_TYPE_TAB_LABELS,
  FieldType,
  ValidationResultTableComponent
} from './validation-result-table.component';
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
    getDraft: () => of({}),
    getHistory: () => of([]),
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

  function clickBulk(type: 'apply-all' | 'accept-as-is' | 'standardise', fieldType: FieldType = 'tenant'): void {
    component.requestBulkAction(type, 0, fieldType, 'Tenant names', new Event('click'));
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

  function namesInDisplayBucketsFor(fieldType: FieldType): string[] {
    return displayBucketKeys().flatMap(key =>
      component.rowsForDisplayBucket(0, fieldType, key).map(r => r.tenantName)
    );
  }

  function sumDisplayBucketLengthsFor(fieldType: FieldType): number {
    return displayBucketKeys().reduce(
      (sum, key) => sum + component.rowsForDisplayBucket(0, fieldType, key).length,
      0
    );
  }

  function expandFileAndDisplaySectionsFor(fieldType: FieldType): void {
    if (!component.isFileExpanded(0)) {
      component.toggleFile(0);
    }
    component.onFieldToggleChange(0, { value: fieldType } as MatButtonToggleChange);
    for (const bucket of component.displayBuckets) {
      if (!component.isSectionExpanded(0, fieldType, bucket.key)) {
        component.toggleSection(0, fieldType, bucket.key);
      }
    }
    fixture.detectChanges();
  }

  function seedTenantAndParent(
    tenantRows: ValidationResult[],
    parentRows: ValidationResult[] | null,
    closedDealsResponse?: ClosedDealsValidationResponse
  ): void {
    component.selectedFiles = [new File([], 'char.xlsx')];
    component.batchResults = [
      {
        fileName: 'char.xlsx',
        fileId: 'file-char',
        historyId: 1,
        response: {
          total: tenantRows.length,
          excluded: tenantRows.filter(r => r.status === 'excluded').length,
          suggested: tenantRows.filter(r => r.status === 'suggested').length,
          flagged: tenantRows.filter(r => r.status === 'flagged').length,
          new: tenantRows.filter(r => r.status === 'new').length,
          results: tenantRows
        },
        parentResponse: parentRows
          ? {
              total: parentRows.length,
              excluded: parentRows.filter(r => r.status === 'excluded').length,
              suggested: parentRows.filter(r => r.status === 'suggested').length,
              flagged: parentRows.filter(r => r.status === 'flagged').length,
              new: parentRows.filter(r => r.status === 'new').length,
              results: parentRows
            }
          : null,
        ...(closedDealsResponse ? { closedDealsResponse } : {})
      }
    ];
  }

  function cdGroup(
    tenantName: string,
    status: string,
    rowIndexes: number[],
    extras: Partial<ClosedDealsValidationGroup> = {}
  ): ClosedDealsValidationGroup {
    const unit = extras.unit ?? `CD-${rowIndexes[0] ?? 0}`;
    return {
      building: extras.building ?? 'Harbor Test Mall',
      unit,
      tenantName,
      rowIndexes,
      classifyStatus: extras.classifyStatus ?? (status === 'excluded' ? 'correct' : status),
      status,
      suggestion: extras.suggestion ?? null,
      matchSource: extras.matchSource ?? null,
      suggestedName: extras.suggestedName ?? extras.suggestion ?? '',
      confidence: extras.confidence ?? null,
      reason: extras.reason ?? status,
      isAmbiguousMultiParty: extras.isAmbiguousMultiParty ?? false
    };
  }

  function cdResponse(groups: ClosedDealsValidationGroup[]): ClosedDealsValidationResponse {
    return {
      total: groups.length,
      excluded: groups.filter(g => g.status === 'excluded').reduce((n, g) => n + g.rowIndexes.length, 0),
      suggested: groups.filter(g => g.status === 'suggested').reduce((n, g) => n + g.rowIndexes.length, 0),
      flagged: groups.filter(g => g.status === 'flagged').reduce((n, g) => n + g.rowIndexes.length, 0),
      new: groups.filter(g => g.status === 'new').reduce((n, g) => n + g.rowIndexes.length, 0),
      groups
    };
  }

  function closedDealsSourceKeys(result: BatchValidationResult): string[] {
    return Object.keys(result).filter(key => /closedDeal/i.test(key));
  }

  it('T5_CHARACTERIZATION_parent_unrecognisedStatus_isSilentlyDropped', () => {
    const recognised = [
      characterizationRow(1, 'Parent Name New', 'new'),
      characterizationRow(2, 'Parent Name Suggested', 'suggested', {
        suggestion: 'Canonical Suggested'
      }),
      characterizationRow(3, 'Parent Name Flagged', 'flagged', {
        suggestion: 'Canonical Flagged',
        reason: 'Standardisation'
      }),
      characterizationRow(4, 'Parent Name Excluded', 'excluded')
    ];
    const dropped = characterizationRow(99, 'Parent Name Unrecognised', '__no_such_status__');
    seedTenantAndParent(
      [characterizationRow(10, 'RR Tenant Filler', 'new')],
      [...recognised, dropped]
    );
    expandFileAndDisplaySectionsFor('parent');

    expect(namesInDisplayBucketsFor('parent'))
      .withContext('parent: unrecognised status must appear in no display bucket')
      .not.toContain('Parent Name Unrecognised');
    expect(fixture.nativeElement.textContent).not.toContain('Parent Name Unrecognised');

    for (const key of displayBucketKeys()) {
      expect(component.bucketCount(0, 'parent', key)).toBe(
        component.rowsForDisplayBucket(0, 'parent', key).length
      );
    }
    expect(sumDisplayBucketLengthsFor('parent')).toBeLessThan(
      component.batchResults[0].parentResponse!.results.length
    );
    expect(sumDisplayBucketLengthsFor('parent')).toBe(recognised.length);
  });

  it('T5_CHARACTERIZATION_parent_vacantRow_isOmittedFromDisplayAndCount', () => {
    seedTenantAndParent(
      [characterizationRow(10, 'RR Tenant Filler', 'new')],
      [
        characterizationRow(1, 'Occupied Parent Co', 'new'),
        characterizationRow(2, 'VACANT', 'new', { reason: 'New Parent' }),
        characterizationRow(3, 'Blank Parent Co', 'new', { reason: 'blank / vacant' })
      ]
    );
    expandFileAndDisplaySectionsFor('parent');

    const newNames = component.rowsForDisplayBucket(0, 'parent', 'new').map(r => r.tenantName);
    expect(newNames).toEqual(['Occupied Parent Co']);
    expect(component.bucketCount(0, 'parent', 'new')).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Occupied Parent Co');
    expect(fixture.nativeElement.textContent).not.toContain('VACANT');
    expect(fixture.nativeElement.textContent).not.toContain('Blank Parent Co');
  });

  it('T5_CHARACTERIZATION_parent_statusVocabulary_eachComparedStatusLandsInABucket', () => {
    const derivedStatusVocabulary = ['new', 'suggested', 'flagged', 'excluded'] as const;
    const rows = [
      characterizationRow(1, 'Parent Vocab New', 'new'),
      characterizationRow(2, 'Parent Vocab Suggested', 'suggested', {
        suggestion: 'Canon Suggested'
      }),
      characterizationRow(3, 'Parent Vocab Flagged', 'flagged', {
        suggestion: 'Canon Flagged',
        reason: 'Standardisation'
      }),
      characterizationRow(4, 'Parent Vocab Excluded', 'excluded')
    ];
    seedTenantAndParent([characterizationRow(10, 'RR Tenant Filler', 'new')], rows);

    const landing: Record<string, string[]> = {};
    for (const status of derivedStatusVocabulary) {
      const name = rows.find(r => r.status === status)!.tenantName;
      landing[status] = displayBucketKeys().filter(key =>
        component.rowsForDisplayBucket(0, 'parent', key).some(r => r.tenantName === name)
      );
      expect(landing[status].length)
        .withContext(`parent ${status} must land in at least one display bucket`)
        .toBeGreaterThan(0);
    }

    expect(landing['new']).toEqual(['new']);
    expect(landing['suggested']).toEqual(['suggested']);
    expect(landing['flagged']).toEqual(['suggested']);
    expect(landing['excluded']).toEqual(['excluded']);
  });

  it('T6_closedDealsTenant_isPopulatedFromClosedDealsResponse_noRrLeak', () => {
    const tenantRow = characterizationRow(1, 'RR-Tenant-Leak-Probe', 'new');
    const parentRow = characterizationRow(2, 'RR-Parent-Leak-Probe', 'suggested', {
      suggestion: 'Parent Canon'
    });
    const cdOnly = cdGroup('CD-Only-Name', 'new', [20], { unit: 'CD-UNIT-77' });
    seedTenantAndParent([tenantRow], [parentRow], cdResponse([cdOnly]));

    const result = component.batchResults[0];
    expect(closedDealsSourceKeys(result))
      .withContext('CD rows must come from a present closedDealsResponse key')
      .toContain('closedDealsResponse');
    expect(result.closedDealsResponse).toBeTruthy();
    expect(result.response.results.length).toBeGreaterThan(0);
    expect(result.parentResponse!.results.length).toBeGreaterThan(0);

    expect(namesInDisplayBucketsFor('closedDealsTenant')).toEqual(['CD-Only-Name']);
    expect(sumDisplayBucketLengthsFor('closedDealsTenant')).toBe(1);
    expect(component.fieldGroupRowCount(0, 'closedDealsTenant')).toBe(1);

    const cdNames = namesInDisplayBucketsFor('closedDealsTenant');
    expect(cdNames).not.toContain('RR-Tenant-Leak-Probe');
    expect(cdNames).not.toContain('RR-Parent-Leak-Probe');
    expect(namesInDisplayBucketsFor('tenant')).not.toContain('CD-Only-Name');
    expect(namesInDisplayBucketsFor('parent')).not.toContain('CD-Only-Name');

    expandFileAndDisplaySectionsFor('closedDealsTenant');
    expect(component.activeFieldType(0)).toBe('closedDealsTenant');
    expect(fixture.nativeElement.textContent).toContain(FIELD_TYPE_TAB_LABELS.closedDealsTenant);
    expect(fixture.nativeElement.textContent).toContain('CD-Only-Name');
    expect(fixture.nativeElement.textContent).not.toContain('RR-Tenant-Leak-Probe');
    expect(fixture.nativeElement.textContent).not.toContain('RR-Parent-Leak-Probe');

    component.onSearchTermChange(0, 'cd-unit-77');
    expect(
      component.rowsForSearchedDisplayBucket(0, 'closedDealsTenant', 'new').map(r => r.tenantName)
    ).toEqual(['CD-Only-Name']);
    component.onSearchTermChange(0, 'no-such-unit');
    expect(component.rowsForSearchedDisplayBucket(0, 'closedDealsTenant', 'new')).toEqual([]);
    component.onSearchTermChange(0, '');

    const cdRow = component.rowsForDisplayBucket(0, 'closedDealsTenant', 'new')[0];
    const sizeBefore = (component as any).corrections.size;
    component.acceptRow(0, 'closedDealsTenant', cdRow);
    expect((component as any).corrections.size)
      .withContext('CD acceptRow must persist into the corrections map')
      .toBe(sizeBefore + 1);
    const stored = Array.from(
      ((component as any).corrections as Map<string, { fieldType: string; originalName: string }>).values()
    );
    expect(stored.some(c => c.fieldType === 'ClosedDealsTenant' && c.originalName === 'CD-Only-Name'))
      .toBe(true);
    expect(stored.some(c => c.originalName === 'RR-Tenant-Leak-Probe')).toBe(false);
  });

  it('T7_noClosedDealsResponse_doesNotRenderCdTab', () => {
    seedTenantAndParent(
      [characterizationRow(1, 'RR Tenant Filler', 'new')],
      [characterizationRow(2, 'RR Parent Filler', 'new')]
    );

    expect(closedDealsSourceKeys(component.batchResults[0])).toEqual([]);
    expect(component.fieldToggleTypesFor(0)).toEqual(['tenant', 'parent']);
    expect(component.fieldToggleTypesFor(0)).not.toContain('closedDealsTenant');

    if (!component.isFileExpanded(0)) {
      component.toggleFile(0);
    }
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(FIELD_TYPE_TAB_LABELS.tenant);
    expect(fixture.nativeElement.textContent).toContain(FIELD_TYPE_TAB_LABELS.parent);
    expect(fixture.nativeElement.textContent)
      .withContext('absent closedDealsResponse must not render the CD tab')
      .not.toContain(FIELD_TYPE_TAB_LABELS.closedDealsTenant);

    component.onFieldToggleChange(0, { value: 'closedDealsTenant' } as MatButtonToggleChange);
    fixture.detectChanges();
    expect(component.activeFieldType(0)).toBe('tenant');
  });

  it('T8_cdCountIsItsOwn_andMultiIndexGroupKeepsEveryIndex', () => {
    const tenantRows = [
      characterizationRow(1, 'RR Alpha', 'new'),
      characterizationRow(2, 'RR Beta', 'new')
    ];
    const multiIndexes = [10, 11, 12, 13, 14];
    const multiGroup = cdGroup('FANOUTZYNX', 'new', multiIndexes, {
      unit: '10',
      building: 'Harbor Test Mall'
    });
    seedTenantAndParent(tenantRows, [characterizationRow(3, 'RR Parent Filler', 'new')], cdResponse([multiGroup]));

    const rrCount = component.fieldGroupRowCount(0, 'tenant');
    const cdCount = component.fieldGroupRowCount(0, 'closedDealsTenant');
    expect(rrCount).toBe(2);
    expect(cdCount).toBe(1);
    expect(cdCount)
      .withContext('CD count must be its own, not equal to RR; equal counts prove nothing')
      .not.toBe(rrCount);

    const cdRows = component.rowsForDisplayBucket(0, 'closedDealsTenant', 'new');
    expect(cdRows.length)
      .withContext('a multi-index group still renders as one display row')
      .toBe(1);
    const mapped = cdRows[0] as ClosedDealsMappedRow;
    expect(mapped.tenantName).toBe('FANOUTZYNX');
    expect(mapped.rowIndexes)
      .withContext('every sibling index from the group must be retained on the row object')
      .toEqual(multiIndexes);
    expect(mapped.appliesTo.length).toBe(multiIndexes.length);
    expect(mapped.appliesTo.every(a => a.building === 'Harbor Test Mall' && a.unit === '10')).toBe(true);
  });

  it('T9_collidezynx101_appearsIndependentlyInRrAndCd', () => {
    const collideRr = characterizationRow(2, 'COLLIDEZYNX', 'new', {
      unitId: '101',
      buildingName: 'Harbor Test Mall',
      appliesTo: [{ building: 'Harbor Test Mall', unit: '101' }]
    });
    const rrOnly = characterizationRow(4, 'RRONLYZYNX', 'new', { unitId: '701' });
    const collideCd = cdGroup('COLLIDEZYNX', 'new', [2], {
      unit: '101',
      building: 'Harbor Test Mall'
    });
    const cdOnly = cdGroup('FANOUTZYNX', 'new', [4, 5], { unit: '10' });
    seedTenantAndParent(
      [collideRr, rrOnly],
      [characterizationRow(9, 'Parent Filler', 'new')],
      cdResponse([collideCd, cdOnly])
    );

    const rrNames = namesInDisplayBucketsFor('tenant');
    const cdNames = namesInDisplayBucketsFor('closedDealsTenant');
    expect(rrNames).toContain('COLLIDEZYNX');
    expect(cdNames).toContain('COLLIDEZYNX');
    expect(rrNames).toContain('RRONLYZYNX');
    expect(cdNames).not.toContain('RRONLYZYNX');
    expect(cdNames).toContain('FANOUTZYNX');
    expect(rrNames).not.toContain('FANOUTZYNX');

    const cdBefore = component
      .rowsForDisplayBucket(0, 'closedDealsTenant', 'new')
      .find(r => r.tenantName === 'COLLIDEZYNX') as ClosedDealsMappedRow;
    expect(cdBefore.rowIndexes).toEqual([2]);

    component.acceptRow(0, 'tenant', collideRr);
    expect(stagedOriginalNames()).toContain('COLLIDEZYNX');
    const cdAfterRrAccept = component
      .rowsForDisplayBucket(0, 'closedDealsTenant', 'new')
      .find(r => r.tenantName === 'COLLIDEZYNX') as ClosedDealsMappedRow;
    expect(cdAfterRrAccept.tenantName).toBe('COLLIDEZYNX');
    expect(cdAfterRrAccept.rowIndexes).toEqual([2]);

    const sizeAfterRr = (component as any).corrections.size;
    component.acceptRow(0, 'closedDealsTenant', cdAfterRrAccept);
    expect((component as any).corrections.size)
      .withContext('accepting the CD collide row must stage its own correction')
      .toBe(sizeAfterRr + 1);
    const payload = (component as any).buildDownloadPayload(0);
    expect(payload.tenantCorrections.length).toBe(1);
    expect(payload.tenantCorrections[0].originalName).toBe('COLLIDEZYNX');
    expect(payload.closedDealsCorrections.length).toBe(1);
    expect(payload.closedDealsCorrections[0].originalName).toBe('COLLIDEZYNX');
    expect(payload.closedDealsCorrections[0].unit).toBe('101');
    expect(payload.parentCorrections.length).toBe(0);
  });

  it('T10_cdBulkActions_areInert', () => {
    const groups = [
      cdGroup('CD Suggested Co', 'suggested', [30], {
        suggestion: 'CD Suggested Canonical',
        suggestedName: 'CD Suggested Canonical'
      }),
      cdGroup('CD Flagged Co', 'flagged', [31], {
        suggestion: 'CD Flagged Canonical',
        suggestedName: 'CD Flagged Canonical',
        reason: 'Standardisation'
      }),
      cdGroup('CD New Co', 'new', [32])
    ];
    seedTenantAndParent(
      [characterizationRow(1, 'RR Tenant Filler', 'new')],
      [characterizationRow(2, 'RR Parent Filler', 'new')],
      cdResponse(groups)
    );

    expect(component.fieldGroupRowCount(0, 'closedDealsTenant')).toBe(3);

    clickBulk('apply-all', 'closedDealsTenant');
    clickBulk('accept-as-is', 'closedDealsTenant');
    clickBulk('standardise', 'closedDealsTenant');

    expect((component as any).corrections.size)
      .withContext('CD bulk actions must persist one correction per applicable row')
      .toBe(3);
    expect(stagedOriginalNames().sort()).toEqual([
      'CD Flagged Co',
      'CD New Co',
      'CD Suggested Co'
    ]);
    const payload = (component as any).buildDownloadPayload(0);
    expect(payload.tenantCorrections).toEqual([]);
    expect(payload.parentCorrections).toEqual([]);
    expect(payload.closedDealsCorrections.map((c: { originalName: string }) => c.originalName).sort())
      .toEqual(['CD Flagged Co', 'CD New Co', 'CD Suggested Co']);
  });

  function failedCdResponse(): ClosedDealsValidationResponse {
    return {
      total: 0,
      excluded: 0,
      suggested: 0,
      flagged: 0,
      new: 0,
      groups: [],
      error: {
        code: 'CLOSED_DEALS_PARSE_FAILED',
        message: 'Closed Deals could not be parsed.'
      }
    };
  }

  function emptyPresentCdResponse(): ClosedDealsValidationResponse {
    return {
      total: 0,
      excluded: 0,
      suggested: 0,
      flagged: 0,
      new: 0,
      groups: []
    };
  }

  function toggleMatching(label: string): DebugElement {
    const match = fixture.debugElement
      .queryAll(By.css('mat-button-toggle'))
      .find(d => (d.nativeElement.textContent as string).includes(label));
    expect(match)
      .withContext(`toggle containing "${label}"`)
      .toBeTruthy();
    return match!;
  }

  it('T11_FAILED_rendersVisibly_withoutZeroCount', () => {
    seedTenantAndParent(
      [characterizationRow(1, 'RR Tenant Alive', 'new')],
      [characterizationRow(2, 'RR Parent Alive', 'new')],
      failedCdResponse()
    );
    expandFileAndDisplaySectionsFor('closedDealsTenant');

    const cdToggle = toggleMatching(FIELD_TYPE_TAB_LABELS.closedDealsTenant);
    const cdToggleText = (cdToggle.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
    expect(cdToggleText).toContain(FIELD_TYPE_TAB_LABELS.closedDealsTenant);
    expect(cdToggleText).toContain('failed');
    expect(cdToggleText)
      .withContext('FAILED must not display a parenthetical zero that reads as a real result')
      .not.toMatch(/\(0\)/);

    const failedPanel = fixture.nativeElement.querySelector('.cd-failed');
    expect(failedPanel).toBeTruthy();
    expect(failedPanel.textContent).toContain('Closed Deals could not be parsed');
    expect(fixture.nativeElement.querySelector('.bucket')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Apply All Suggestions');
  });

  it('T12_FAILED_isNotAbsent_andNotEmptyPresent', () => {
    seedTenantAndParent(
      [characterizationRow(1, 'RR Tenant Alive', 'new')],
      [characterizationRow(2, 'RR Parent Alive', 'new')]
    );
    if (!component.isFileExpanded(0)) {
      component.toggleFile(0);
    }
    fixture.detectChanges();
    const absentText = fixture.nativeElement.textContent as string;
    expect(component.fieldToggleTypesFor(0)).not.toContain('closedDealsTenant');
    expect(absentText).not.toContain(FIELD_TYPE_TAB_LABELS.closedDealsTenant);
    expect(fixture.nativeElement.querySelector('.cd-failed')).toBeNull();

    seedTenantAndParent(
      [characterizationRow(1, 'RR Tenant Alive', 'new')],
      [characterizationRow(2, 'RR Parent Alive', 'new')],
      failedCdResponse()
    );
    expandFileAndDisplaySectionsFor('closedDealsTenant');
    const failedToggle = (toggleMatching(FIELD_TYPE_TAB_LABELS.closedDealsTenant).nativeElement
      .textContent as string).replace(/\s+/g, ' ');
    expect(failedToggle).toContain('failed');
    expect(failedToggle).not.toMatch(/\(0\)/);
    expect(fixture.nativeElement.querySelector('.cd-failed')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.bucket')).toBeNull();

    seedTenantAndParent(
      [characterizationRow(1, 'RR Tenant Alive', 'new')],
      [characterizationRow(2, 'RR Parent Alive', 'new')],
      emptyPresentCdResponse()
    );
    expandFileAndDisplaySectionsFor('closedDealsTenant');
    const emptyToggle = (toggleMatching(FIELD_TYPE_TAB_LABELS.closedDealsTenant).nativeElement
      .textContent as string).replace(/\s+/g, ' ');
    expect(emptyToggle).toContain('(0)');
    expect(emptyToggle).not.toContain('failed');
    expect(fixture.nativeElement.querySelector('.cd-failed'))
      .withContext('PRESENT-but-empty must not use the FAILED error panel')
      .toBeNull();
    expect(fixture.nativeElement.querySelector('.bucket')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('New Names (0)');
  });

  it('T13_cdFailure_doesNotBlockRr', () => {
    const tenantRow = characterizationRow(1, 'RR Tenant Alive', 'new');
    const parentRow = characterizationRow(2, 'RR Parent Alive', 'suggested', {
      suggestion: 'Parent Canon'
    });
    seedTenantAndParent([tenantRow], [parentRow], failedCdResponse());

    expandFileAndDisplaySectionsFor('tenant');
    expect(namesInDisplayBucketsFor('tenant')).toContain('RR Tenant Alive');
    component.acceptRow(0, 'tenant', tenantRow);
    expect(stagedOriginalNames()).toContain('RR Tenant Alive');

    expandFileAndDisplaySectionsFor('parent');
    expect(namesInDisplayBucketsFor('parent')).toContain('RR Parent Alive');
    component.acceptRow(0, 'parent', parentRow);
    expect(stagedOriginalNames()).toContain('RR Parent Alive');

    const payload = (component as any).buildDownloadPayload(0);
    expect(payload.tenantCorrections.length).toBe(1);
    expect(payload.tenantCorrections[0].originalName).toBe('RR Tenant Alive');
    expect(payload.parentCorrections.length).toBe(1);
    expect(payload.parentCorrections[0].originalName).toBe('RR Parent Alive');
  });

  it('T14_parentTab_disabledWithReason_whenNoParentResponse', () => {
    seedTenantResults([characterizationRow(1, 'Solo Tenant Row', 'new')]);
    expect(component.batchResults[0].parentResponse).toBeNull();
    if (!component.isFileExpanded(0)) {
      component.toggleFile(0);
    }
    fixture.detectChanges();

    const parentToggle = toggleMatching(FIELD_TYPE_TAB_LABELS.parent);
    expect(parentToggle.componentInstance.disabled)
      .withContext('parent toggle must use mat-button-toggle disabled, not a swallowed click')
      .toBe(true);
    expect(parentToggle.nativeElement.classList.contains('mat-button-toggle-disabled')).toBe(true);
    expect(parentToggle.nativeElement.getAttribute('title')).toBe('No parent data in this file');

    const tenantToggle = toggleMatching(FIELD_TYPE_TAB_LABELS.tenant);
    expect(tenantToggle.componentInstance.disabled).toBe(false);

    seedTenantAndParent(
      [characterizationRow(1, 'RR Tenant Alive', 'new')],
      [characterizationRow(2, 'RR Parent Alive', 'new')]
    );
    if (!component.isFileExpanded(0)) {
      component.toggleFile(0);
    }
    fixture.detectChanges();
    const enabledParent = toggleMatching(FIELD_TYPE_TAB_LABELS.parent);
    expect(enabledParent.componentInstance.disabled)
      .withContext('files WITH parent data must keep the parent toggle enabled')
      .toBe(false);
    expect(enabledParent.nativeElement.getAttribute('title')).toBeNull();
  });

  function collidePair(): {
    collideRr: ValidationResult;
    collideCd: ClosedDealsValidationGroup;
  } {
    const collideRr = characterizationRow(2, 'COLLIDEZYNX', 'new', {
      unitId: '101',
      buildingName: 'Harbor Test Mall',
      appliesTo: [{ building: 'Harbor Test Mall', unit: '101' }]
    });
    const collideCd = cdGroup('COLLIDEZYNX', 'new', [2], {
      unit: '101',
      building: 'Harbor Test Mall'
    });
    return { collideRr, collideCd };
  }

  function stagedByFieldType(): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    ((component as any).corrections as Map<string, { fieldType: string; originalName: string }>)
      .forEach(record => {
        grouped[record.fieldType] = grouped[record.fieldType] ?? [];
        grouped[record.fieldType].push(record.originalName);
      });
    return grouped;
  }

  function resumeFromPayload(payload: { fileId: string }): void {
    const api = TestBed.inject(ValidationApiService) as unknown as {
      getDraft: (fileId: string) => unknown;
    };
    const batch = component.batchResults[0];
    api.getDraft = () => of({
      fileId: batch.fileId,
      fileName: batch.fileName,
      status: 'InProgress',
      savedAt: '2026-09-03T00:00:00Z',
      completedAt: null,
      counts: { total: 0, excluded: 0, suggested: 0, flagged: 0, new: 0 },
      resultsJson: JSON.stringify(batch),
      decisionsJson: JSON.stringify(payload),
      fileBase64: btoa(''),
      fileContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    if (!jasmine.isSpy(window.confirm)) {
      spyOn(window, 'confirm').and.returnValue(true);
    }
    component.resumeDraft(batch.fileId);
  }

  it('T15_sectionDiscriminator_bothDirections_surviveSaveResume', () => {
    const { collideRr, collideCd } = collidePair();
    seedTenantAndParent(
      [collideRr],
      [characterizationRow(9, 'Parent Filler', 'new')],
      cdResponse([collideCd])
    );

    component.acceptRow(0, 'tenant', collideRr);
    const rrOnlyPayload = (component as any).buildDownloadPayload(0);
    expect(rrOnlyPayload.tenantCorrections.length).toBe(1);
    expect(rrOnlyPayload.closedDealsCorrections).toEqual([]);

    resumeFromPayload(rrOnlyPayload);
    let byType = stagedByFieldType();
    expect(byType['Tenant']).toEqual(['COLLIDEZYNX']);
    expect(byType['ClosedDealsTenant'])
      .withContext('RR decision must not replay onto the CD collide row')
      .toBeUndefined();
    expect((component as any).autoAlignApplied)
      .withContext('resume must latch auto-align so the file is not re-staged')
      .toBe(true);

    const cdRow = component
      .rowsForDisplayBucket(0, 'closedDealsTenant', 'new')
      .find(r => r.tenantName === 'COLLIDEZYNX') as ClosedDealsMappedRow;
    component.acceptRow(0, 'closedDealsTenant', cdRow);
    const bothPayload = (component as any).buildDownloadPayload(0);
    expect(bothPayload.tenantCorrections.length).toBe(1);
    expect(bothPayload.closedDealsCorrections.length).toBe(1);

    resumeFromPayload(bothPayload);
    byType = stagedByFieldType();
    expect(byType['Tenant']).toEqual(['COLLIDEZYNX']);
    expect(byType['ClosedDealsTenant']).toEqual(['COLLIDEZYNX']);

    (component as any).corrections = new Map();
    (component as any).autoAlignApplied = false;
    seedTenantAndParent(
      [collideRr],
      [characterizationRow(9, 'Parent Filler', 'new')],
      cdResponse([collideCd])
    );
    const cdOnlyRow = component
      .rowsForDisplayBucket(0, 'closedDealsTenant', 'new')
      .find(r => r.tenantName === 'COLLIDEZYNX') as ClosedDealsMappedRow;
    component.acceptRow(0, 'closedDealsTenant', cdOnlyRow);
    const cdOnlyPayload = (component as any).buildDownloadPayload(0);
    expect(cdOnlyPayload.tenantCorrections).toEqual([]);
    expect(cdOnlyPayload.closedDealsCorrections.length).toBe(1);

    resumeFromPayload(cdOnlyPayload);
    byType = stagedByFieldType();
    expect(byType['ClosedDealsTenant']).toEqual(['COLLIDEZYNX']);
    expect(byType['Tenant'])
      .withContext('CD decision must not replay onto the RR collide row')
      .toBeUndefined();
  });

  it('T16_matchSourceParity_fourTenantScenarios', () => {
    const tenantExcluded = characterizationRow(1, 'Align Tenant', 'excluded', {
      suggestion: 'Align Tenant Canon',
      suggestedName: 'Align Tenant Canon',
      matchSource: 'MasterList'
    });
    const tenantNew = characterizationRow(2, 'New Tenant', 'new');
    const tenantSuggested = characterizationRow(3, 'Suggested Tenant', 'suggested', {
      suggestion: 'Suggested Tenant Canon',
      suggestedName: 'Suggested Tenant Canon',
      matchSource: 'MasterList'
    });
    const tenantManual = characterizationRow(4, 'Manual Tenant', 'new');
    const cdExcluded = cdGroup('Align CD', 'excluded', [11], {
      suggestion: 'Align CD Canon',
      suggestedName: 'Align CD Canon',
      matchSource: 'MasterList'
    });
    const cdNew = cdGroup('New CD', 'new', [12]);
    const cdSuggested = cdGroup('Suggested CD', 'suggested', [13], {
      suggestion: 'Suggested CD Canon',
      suggestedName: 'Suggested CD Canon',
      matchSource: 'MasterList'
    });
    const cdManual = cdGroup('Manual CD', 'new', [14]);
    seedTenantAndParent(
      [tenantExcluded, tenantNew, tenantSuggested, tenantManual],
      [characterizationRow(99, 'Parent Filler', 'new')],
      cdResponse([cdExcluded, cdNew, cdSuggested, cdManual])
    );

    (component as any).autoStageForField(0, 'tenant');
    (component as any).autoStageForField(0, 'closedDealsTenant');
    component.acceptRow(0, 'tenant', tenantNew);
    component.acceptRow(
      0,
      'closedDealsTenant',
      component.rowsForDisplayBucket(0, 'closedDealsTenant', 'new').find(r => r.tenantName === 'New CD')!
    );
    component.acceptRow(0, 'tenant', tenantSuggested);
    component.acceptRow(
      0,
      'closedDealsTenant',
      component.rowsForDisplayBucket(0, 'closedDealsTenant', 'suggested').find(r => r.tenantName === 'Suggested CD')!
    );
    component.setManualCorrection(0, 'tenant', tenantManual, 'Typed Tenant');
    component.setManualCorrection(
      0,
      'closedDealsTenant',
      component.rowsForDisplayBucket(0, 'closedDealsTenant', 'new').find(r => r.tenantName === 'Manual CD')!,
      'Typed CD'
    );

    const byName = new Map<string, string | null>();
    ((component as any).corrections as Map<string, { originalName: string; matchSource: string | null }>)
      .forEach(record => byName.set(record.originalName, record.matchSource));

    expect(byName.get('Align Tenant')).toBe('AutoAligned');
    expect(byName.get('Align CD')).toBe('AutoAligned');
    expect(byName.get('New Tenant')).toBe('AcceptedAsIs');
    expect(byName.get('New CD')).toBe('AcceptedAsIs');
    expect(byName.get('Suggested Tenant')).toBe('MasterList');
    expect(byName.get('Suggested CD')).toBe('MasterList');
    expect(byName.get('Manual Tenant')).toBe('ManualOverride');
    expect(byName.get('Manual CD')).toBe('ManualOverride');
  });

  it('T17_autoAlignStagesCd_andReviewerAcceptIsNotAutoAligned', () => {
    const cdExcluded = cdGroup('CD Align Me', 'excluded', [40], {
      suggestion: 'CD Align Canon',
      suggestedName: 'CD Align Canon',
      matchSource: 'MasterList',
      unit: '401'
    });
    const cdSuggested = cdGroup('CD Reviewer Row', 'suggested', [41], {
      suggestion: 'CD Reviewer Canon',
      suggestedName: 'CD Reviewer Canon',
      matchSource: 'Normalisation',
      unit: '402'
    });
    const batch = {
      fileName: 'char.xlsx',
      fileId: 'file-char',
      historyId: 1,
      response: {
        total: 1,
        excluded: 1,
        suggested: 0,
        flagged: 0,
        new: 0,
        results: [
          characterizationRow(1, 'RR Align Me', 'excluded', {
            suggestion: 'RR Align Canon',
            suggestedName: 'RR Align Canon',
            matchSource: 'MasterList'
          })
        ]
      },
      parentResponse: {
        total: 0,
        excluded: 0,
        suggested: 0,
        flagged: 0,
        new: 0,
        results: []
      },
      closedDealsResponse: cdResponse([cdExcluded, cdSuggested])
    };

    const api = TestBed.inject(ValidationApiService) as unknown as {
      validateBatch: () => unknown;
    };
    api.validateBatch = () => of([batch]);
    component.selectedFiles = [new File([], 'char.xlsx')];
    (component as any).suppressAutosaveDirty = true;
    (component as any).autoAlignApplied = false;
    component.validate();

    const autoAligned = Array.from(
      ((component as any).corrections as Map<string, { originalName: string; matchSource: string; fieldType: string }>).values()
    );
    expect(autoAligned.some(c =>
      c.fieldType === 'ClosedDealsTenant'
      && c.originalName === 'CD Align Me'
      && c.matchSource === 'AutoAligned'
    )).toBe(true);

    const reviewerRow = component
      .rowsForDisplayBucket(0, 'closedDealsTenant', 'suggested')
      .find(r => r.tenantName === 'CD Reviewer Row')!;
    component.acceptRow(0, 'closedDealsTenant', reviewerRow);
    const reviewer = Array.from(
      ((component as any).corrections as Map<string, { originalName: string; matchSource: string }>).values()
    ).find(c => c.originalName === 'CD Reviewer Row');
    expect(reviewer?.matchSource)
      .withContext('a reviewer-accepted CD row must keep the server matchSource, not AutoAligned')
      .toBe('Normalisation');
  });

  it('T18_payloadShape_matchesGatewayClosedDealsFields_tenantParentUnchanged', () => {
    const tenantRow = characterizationRow(2, 'COLLIDEZYNX', 'new', {
      unitId: '101',
      buildingName: 'Harbor Test Mall',
      appliesTo: [{ building: 'Harbor Test Mall', unit: '101' }]
    });
    const parentRow = characterizationRow(3, 'Harbor Holdings', 'suggested', {
      suggestion: 'Harbor Holdings Canon',
      suggestedName: 'Harbor Holdings Canon',
      matchSource: 'MasterList',
      appliesTo: [{ building: 'Harbor Test Mall', unit: '101' }]
    });
    const cdRow = cdGroup('COLLIDEZYNX', 'new', [2], {
      unit: '101',
      building: 'Harbor Test Mall'
    });
    seedTenantAndParent([tenantRow], [parentRow], cdResponse([cdRow]));

    component.acceptRow(0, 'tenant', tenantRow);
    component.acceptRow(0, 'parent', parentRow);
    component.acceptRow(
      0,
      'closedDealsTenant',
      component.rowsForDisplayBucket(0, 'closedDealsTenant', 'new')[0]
    );

    const payload = (component as any).buildDownloadPayload(0);
    const expectedTenant = JSON.stringify([
      {
        rowIndex: 2,
        unitId: '101',
        building: 'Harbor Test Mall',
        originalName: 'COLLIDEZYNX',
        correctedName: 'COLLIDEZYNX',
        changeType: 'AcceptedAsIs',
        confidence: null,
        matchSource: 'AcceptedAsIs'
      }
    ]);
    const expectedParent = JSON.stringify([
      {
        rowIndex: 3,
        originalName: 'Harbor Holdings',
        correctedName: 'Harbor Holdings Canon',
        changeType: 'AcceptedSuggestion',
        confidence: 0.9,
        matchSource: 'MasterList',
        appliesTo: [{ building: 'Harbor Test Mall', unit: '101' }]
      }
    ]);
    expect(JSON.stringify(payload.tenantCorrections)).toBe(expectedTenant);
    expect(JSON.stringify(payload.parentCorrections)).toBe(expectedParent);

    expect(payload.closedDealsCorrections.length).toBe(1);
    const cd = payload.closedDealsCorrections[0];
    expect(Object.keys(cd).sort()).toEqual([
      'building',
      'changeType',
      'confidence',
      'correctedName',
      'matchSource',
      'originalName',
      'rowIndex',
      'section',
      'unit'
    ].sort());
    expect(cd.section).toBe('ClosedDeals');
    expect(cd.building).toBe('Harbor Test Mall');
    expect(cd.unit).toBe('101');
    expect(cd.originalName).toBe('COLLIDEZYNX');
    expect(cd.correctedName).toBe('COLLIDEZYNX');
    expect(cd.changeType).toBe('AcceptedAsIs');
    expect(cd.matchSource).toBe('AcceptedAsIs');
    expect(cd.unitId).toBeUndefined();
  });

  it('T19_oneItemPerGroup_multiRowCdGroupProducesOnePayloadItem', () => {
    const sheetRows = [47, 48, 49, 50, 51, 52, 53, 54];
    seedTenantAndParent(
      [characterizationRow(1, 'RR Filler', 'new')],
      [characterizationRow(2, 'Parent Filler', 'new')],
      cdResponse([
        cdGroup('AERIE', 'suggested', sheetRows, {
          unit: '2B',
          building: 'MIDTOWN PLAZA RETAIL',
          suggestion: 'Aerie',
          suggestedName: 'Aerie',
          matchSource: 'MasterList',
          confidence: 100
        })
      ])
    );

    const row = component
      .rowsForDisplayBucket(0, 'closedDealsTenant', 'suggested')[0] as ClosedDealsMappedRow;
    expect(row.rowIndexes)
      .withContext('rowIndexes on the row object must stay the full sibling set')
      .toEqual(sheetRows);
    expect(row.appliesTo.length).toBe(sheetRows.length);

    component.acceptRow(0, 'closedDealsTenant', row);

    expect(row.rowIndexes).toEqual(sheetRows);
    const payload = (component as any).buildDownloadPayload(0);
    expect(payload.closedDealsCorrections.length)
      .withContext('8 sheet rows, one OverlayKey group → one payload item')
      .toBe(1);
    const item = payload.closedDealsCorrections[0];
    expect(item.building).toBe('MIDTOWN PLAZA RETAIL');
    expect(item.unit).toBe('2B');
    expect(item.originalName).toBe('AERIE');
    expect(item.correctedName).toBe('Aerie');
    expect(item.rowIndex).toBe(sheetRows[0]);
    expect(item.section).toBe('ClosedDeals');
  });

  it('T20_groupCountNotRowCount_multipleMultiRowCdGroups', () => {
    const aerieRows = [47, 48, 49, 50, 51, 52, 53, 54];
    const lovisaRows = [4, 5, 6, 7, 8, 9, 10, 11];
    const nespressoRows = [37];
    seedTenantAndParent(
      [characterizationRow(1, 'RR Filler', 'new')],
      [characterizationRow(2, 'Parent Filler', 'new')],
      cdResponse([
        cdGroup('AERIE', 'new', aerieRows, {
          unit: '2B',
          building: 'MIDTOWN PLAZA RETAIL'
        }),
        cdGroup('LOVISA CANADA LTD.', 'suggested', lovisaRows, {
          unit: '15',
          building: 'MIDTOWN PLAZA RETAIL',
          suggestion: 'LOVISA CANADA',
          suggestedName: 'LOVISA CANADA',
          matchSource: 'Normalisation'
        }),
        cdGroup('NESPRESSO/NESPRESSO BOUTIQUE', 'new', nespressoRows, {
          unit: '258',
          building: 'MIDTOWN PLAZA RETAIL'
        })
      ])
    );

    const sheetRowTotal = aerieRows.length + lovisaRows.length + nespressoRows.length;
    expect(sheetRowTotal).toBe(17);

    for (const row of component.rowsForDisplayBucket(0, 'closedDealsTenant', 'new')) {
      component.acceptRow(0, 'closedDealsTenant', row);
    }
    for (const row of component.rowsForDisplayBucket(0, 'closedDealsTenant', 'suggested')) {
      component.acceptRow(0, 'closedDealsTenant', row);
    }

    const payload = (component as any).buildDownloadPayload(0);
    expect(payload.closedDealsCorrections.length)
      .withContext('3 corrected groups, not 17 sheet rows')
      .toBe(3);
    expect(payload.closedDealsCorrections.length).not.toBe(sheetRowTotal);
    expect(payload.closedDealsCorrections.map((c: { originalName: string }) => c.originalName).sort())
      .toEqual(['AERIE', 'LOVISA CANADA LTD.', 'NESPRESSO/NESPRESSO BOUTIQUE']);
  });

  it('T21_tenantParentUntouched_sameDecisionsSameArrays', () => {
    const tenantRow = characterizationRow(2, 'COLLIDEZYNX', 'new', {
      unitId: '101',
      buildingName: 'Harbor Test Mall',
      appliesTo: [{ building: 'Harbor Test Mall', unit: '101' }]
    });
    const parentRow = characterizationRow(3, 'Harbor Holdings', 'suggested', {
      suggestion: 'Harbor Holdings Canon',
      suggestedName: 'Harbor Holdings Canon',
      matchSource: 'MasterList',
      appliesTo: [{ building: 'Harbor Test Mall', unit: '101' }]
    });
    seedTenantAndParent(
      [tenantRow],
      [parentRow],
      cdResponse([
        cdGroup('COLLIDEZYNX', 'new', [2], {
          unit: '101',
          building: 'Harbor Test Mall'
        }),
        cdGroup('AERIE', 'new', [47, 48, 49, 50, 51, 52, 53, 54], {
          unit: '2B',
          building: 'MIDTOWN PLAZA RETAIL'
        })
      ])
    );

    component.acceptRow(0, 'tenant', tenantRow);
    component.acceptRow(0, 'parent', parentRow);
    for (const row of component.rowsForDisplayBucket(0, 'closedDealsTenant', 'new')) {
      component.acceptRow(0, 'closedDealsTenant', row);
    }

    const payload = (component as any).buildDownloadPayload(0);
    expect(JSON.stringify(payload.tenantCorrections)).toBe(JSON.stringify([
      {
        rowIndex: 2,
        unitId: '101',
        building: 'Harbor Test Mall',
        originalName: 'COLLIDEZYNX',
        correctedName: 'COLLIDEZYNX',
        changeType: 'AcceptedAsIs',
        confidence: null,
        matchSource: 'AcceptedAsIs'
      }
    ]));
    expect(JSON.stringify(payload.parentCorrections)).toBe(JSON.stringify([
      {
        rowIndex: 3,
        originalName: 'Harbor Holdings',
        correctedName: 'Harbor Holdings Canon',
        changeType: 'AcceptedSuggestion',
        confidence: 0.9,
        matchSource: 'MasterList',
        appliesTo: [{ building: 'Harbor Test Mall', unit: '101' }]
      }
    ]));
    expect(payload.tenantCorrections.length).toBe(1);
    expect(payload.parentCorrections.length).toBe(1);
    expect(payload.closedDealsCorrections.length).toBe(2);
  });

  it('T6_CHARACTERIZATION_parentTab_cannotLandWithoutParentResponse', () => {
    seedTenantResults([characterizationRow(1, 'Solo Tenant Row', 'new')]);
    expect(component.batchResults[0].parentResponse).toBeNull();

    if (!component.isFileExpanded(0)) {
      component.toggleFile(0);
    }
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent)
      .withContext('parent-less file now shows the toggle group including RR Parent Name')
      .toContain(FIELD_TYPE_TAB_LABELS.parent);

    component.onFieldToggleChange(0, { value: 'parent' } as MatButtonToggleChange);
    fixture.detectChanges();
    expect(component.activeFieldType(0))
      .withContext('parent-less file must not land on the parent tab')
      .toBe('tenant');
  });
});

