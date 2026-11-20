import { ParentValidationResult } from './models/validation.models';
import { ValidationResultTableComponent } from './validation-result-table.component';

function parentRow(overrides: Partial<ParentValidationResult> = {}): ParentValidationResult {
  return {
    rowIndex: 0,
    propertyId: 'P-1',
    unitId: '101',
    tenantName: 'ACME CORP',
    targetName: '',
    buildingName: 'Tower A',
    leaseStart: '2024-01-01',
    status: 'new',
    classifyStatus: 'new',
    suggestion: null,
    matchSource: null,
    suggestedName: null,
    confidence: null,
    reason: 'New Parent Name',
    appliesTo: [{ building: 'Tower A', unit: '101' }],
    ...overrides
  };
}

describe('ValidationResultTableComponent isAcceptDisabled characterization', () => {
  let component: ValidationResultTableComponent;

  beforeEach(() => {
    component = new ValidationResultTableComponent();
    component.fieldType = 'parent';
    component.bucket = 'new';
    component.nameColumnLabel = 'Source Parent Name';
    component.correctionByKey = new Map();
  });

  // Identity-backfill accept-as-is is enabled on the tick; server remains the authority.
  it('T5: identity-backfill new row with no staged correction does not disable accept', () => {
    const row = parentRow({
      isBackfilledFromTenant: true,
      suggestion: null,
      tenantName: 'ACME CORP',
      status: 'new'
    });
    expect(component.isAcceptDisabled(row)).toBe(false);
  });

  // MUST STAY GREEN THROUGH PHASE 2.
  it('T6: ambiguous multi-party row (not backfilled) disables accept', () => {
    const row = parentRow({
      isAmbiguousMultiParty: true,
      isBackfilledFromTenant: false
    });
    expect(component.isAcceptDisabled(row)).toBe(true);
  });

  // MUST STAY GREEN THROUGH PHASE 2 — co-occurrence case; Phase 2 deletes one branch, not the method.
  it('T7: backfill AND ambiguous together still disables accept', () => {
    const row = parentRow({
      isBackfilledFromTenant: true,
      isAmbiguousMultiParty: true
    });
    expect(component.isAcceptDisabled(row)).toBe(true);
  });

  it('T8: identity-backfill row with staged correction does not disable accept', () => {
    const row = parentRow({ isBackfilledFromTenant: true });
    component.correctionByKey = new Map([[String(row.rowIndex), 'OVERRIDE']]);
    expect(component.isAcceptDisabled(row)).toBe(false);
  });

  it('T9: ordinary new parent row (not backfilled, not ambiguous) is enabled with accept tick', () => {
    const row = parentRow({
      isBackfilledFromTenant: false,
      isAmbiguousMultiParty: false
    });
    expect(component.isAcceptDisabled(row)).toBe(false);
    expect(component.showAcceptTick(row)).toBe(true);
  });

  it('T10: identity-backfill accept mousedown emits accept', () => {
    const row = parentRow({
      isBackfilledFromTenant: true,
      suggestion: null,
      status: 'new'
    });
    spyOn(component.accept, 'emit');
    const event = { preventDefault() {}, stopPropagation() {} } as MouseEvent;
    component.onAcceptMouseDown(event, row);
    expect(component.accept.emit).toHaveBeenCalledWith(row);
  });
});
