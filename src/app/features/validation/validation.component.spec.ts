import { fakeAsync, tick } from '@angular/core/testing';
import { MatButtonToggleChange } from '@angular/material/button-toggle';
import { PageEvent } from '@angular/material/paginator';
import { of } from 'rxjs';
import { NotificationService } from 'src/app/core/services/notification.service';
import {
  BatchValidationResult,
  ParentValidationResponse,
  ValidationResult
} from './models/validation.models';
import { ValidationApiService } from './services/validation-api.service';
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
      .withContext('expected Tenant B under file-bbb; positional 0| key still holds Tenant A')
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
      .withContext('expected copy flag to follow file B; Set still keyed as 1')
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
});

