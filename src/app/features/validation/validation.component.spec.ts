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
});
