import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  ParentAppliesToItem,
  ParentValidationResult,
  ValidationResult
} from './models/validation.models';

export type FieldType = 'tenant' | 'parent';
export type BucketKey = 'new' | 'flagged' | 'suggested' | 'excluded';
export type ValidationRow = ValidationResult | ParentValidationResult;

export interface OverridePopoverRequest {
  row: ValidationRow;
  top: number;
  left: number;
  placeholder: string;
}

@Component({
  selector: 'app-validation-result-table',
  templateUrl: './validation-result-table.component.html',
  styleUrls: ['./validation-result-table.component.scss']
})
export class ValidationResultTableComponent {
  @Input() fieldType!: FieldType;
  @Input() bucket!: BucketKey;
  @Input() nameColumnLabel!: string;
  @Input() rows: ValidationRow[] = [];
  @Input() acceptedKeys: Set<string> = new Set();
  @Input() correctionByKey: Map<string, string> = new Map();

  @Output() accept = new EventEmitter<ValidationRow>();
  @Output() manual = new EventEmitter<{ row: ValidationRow; value: string }>();
  @Output() clear = new EventEmitter<ValidationRow>();
  @Output() overrideRequest = new EventEmitter<OverridePopoverRequest>();

  get showActionColumn(): boolean {
    return this.bucket !== 'excluded';
  }

  get showAcceptedIndicator(): boolean {
    // accepted indicator (✓ Corrected + Undo) renders in every bucket,
    // including Correct; only the pending accept/override controls are
    // bucket-gated (see template).
    return true;
  }

  get secondColumnHeader(): string {
    switch (this.bucket) {
      case 'excluded':
        return 'Master List Name';
      case 'flagged':
        return 'Suggested Fix';
      case 'suggested':
      case 'new':
      default:
        return 'Suggested Name';
    }
  }

  trackByRow(index: number): number {
    return index;
  }

  rowKey(row: ValidationRow): string {
    return row.tenantName;
  }

  isAccepted(row: ValidationRow): boolean {
    return this.acceptedKeys.has(this.rowKey(row));
  }

  correctionText(row: ValidationRow): string {
    return this.correctionByKey.get(this.rowKey(row)) ?? '';
  }

  unitDisplay(row: ValidationRow): string {
    const applies = this.appliesToForRow(row);
    const n = applies.length;
    if (n === 1) {
      return applies[0].unit?.trim() || '—';
    }
    return n > 0 ? `${n} units` : '—';
  }

  buildingDisplay(row: ValidationRow): string {
    const buildings = [
      ...new Set(
        this.appliesToForRow(row)
          .map(a => a.building?.trim())
          .filter(b => !!b)
      )
    ];
    if (buildings.length === 0) {
      return '—';
    }
    if (buildings.length <= 2) {
      return buildings.join(', ');
    }
    return `${buildings.length} buildings`;
  }

  private appliesToForRow(row: ValidationRow): ParentAppliesToItem[] {
    if (this.fieldType === 'tenant') {
      const tenant = row as ValidationResult;
      if (tenant.appliesTo?.length) {
        return tenant.appliesTo;
      }
      return [{ building: tenant.buildingName, unit: tenant.unitId }];
    }
    return (row as ParentValidationResult).appliesTo ?? [];
  }

  hasSuggestion(row: ValidationRow): boolean {
    const value = row.suggestion ?? row.suggestedName;
    return value != null && String(value).trim().length > 0;
  }

  isAcceptAsIs(row: ValidationRow): boolean {
    return row.status?.toLowerCase() === 'new';
  }

  isBlankVacant(row: ValidationRow): boolean {
    return row.reason === 'Blank / vacant';
  }

  showAcceptTick(row: ValidationRow): boolean {
    if (this.isBlankVacant(row)) {
      return false;
    }
    return this.hasSuggestion(row) || this.isAcceptAsIs(row);
  }

  isAcceptDisabled(row: ValidationRow): boolean {
    if (!row.isAmbiguousMultiParty) {
      return false;
    }
    return !this.correctionText(row);
  }

  overrideTriggerLabel(row: ValidationRow): string {
    return this.showAcceptTick(row) ? 'Or type override' : 'Correct name';
  }

  onOverrideClick(event: MouseEvent, row: ValidationRow): void {
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    this.overrideRequest.emit({
      row,
      top: rect.bottom + 4,
      left: rect.left,
      placeholder: this.overrideTriggerLabel(row)
    });
  }

  suggestedDisplay(row: ValidationRow): string {
    if (this.bucket === 'excluded') {
      if (this.hasSuggestion(row)) {
        return (row.suggestion ?? row.suggestedName) as string;
      }
      return row.tenantName;
    }
    if (this.bucket === 'suggested' && this.hasSuggestion(row)) {
      return (row.suggestion ?? row.suggestedName) as string;
    }
    if (this.bucket === 'new' && this.isAcceptAsIs(row)) {
      return row.isAmbiguousMultiParty ? '—' : row.tenantName;
    }
    if (this.bucket === 'flagged' && this.hasSuggestion(row)) {
      return (row.suggestion ?? row.suggestedName) as string;
    }
    return '—';
  }

  confidenceDisplay(row: ValidationRow): string {
    if (this.bucket === 'excluded') {
      return row.confidence != null ? `${row.confidence}%` : '100%';
    }
    if (row.confidence != null && row.confidence > 0) {
      return `${row.confidence}%`;
    }
    return '—';
  }

  rowBorderClass(row: ValidationRow): string {
    if (this.bucket === 'excluded' || this.isAccepted(row)) {
      return 'row-border--correct';
    }
    if (this.bucket === 'new') {
      return 'row-border--new';
    }
    if (this.bucket === 'flagged') {
      return 'row-border--flagged';
    }
    return 'row-border--suggested';
  }

  onAcceptMouseDown(event: MouseEvent, row: ValidationRow): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isAcceptDisabled(row)) {
      return;
    }
    this.accept.emit(row);
  }

  onActionClick(event: Event): void {
    event.stopPropagation();
  }
}
