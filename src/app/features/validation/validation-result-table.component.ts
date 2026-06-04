import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  ParentValidationResult,
  ValidationResult
} from './models/validation.models';

export type FieldType = 'tenant' | 'parent';
export type BucketKey = 'flagged' | 'suggested' | 'excluded';
export type ValidationRow = ValidationResult | ParentValidationResult;

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

  get showActionColumn(): boolean {
    return this.bucket !== 'excluded';
  }

  trackByRow(index: number): number {
    return index;
  }

  rowKey(row: ValidationRow): string {
    if (this.fieldType === 'tenant') {
      const t = row as ValidationResult;
      return `${t.unitId}|${t.tenantName}`;
    }
    return row.tenantName;
  }

  isAccepted(row: ValidationRow): boolean {
    return this.acceptedKeys.has(this.rowKey(row));
  }

  correctionText(row: ValidationRow): string {
    return this.correctionByKey.get(this.rowKey(row)) ?? '';
  }

  unitDisplay(row: ValidationRow): string {
    if (this.fieldType === 'tenant') {
      return (row as ValidationResult).unitId;
    }
    const parent = row as ParentValidationResult;
    const n = parent.appliesTo?.length ?? 0;
    if (n === 1) {
      return parent.appliesTo[0].unit?.trim() || '—';
    }
    return n > 0 ? `${n} units` : '—';
  }

  buildingDisplay(row: ValidationRow): string {
    if (this.fieldType === 'tenant') {
      return (row as ValidationResult).buildingName || '—';
    }
    const parent = row as ParentValidationResult;
    const buildings = [
      ...new Set(
        (parent.appliesTo ?? [])
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

  hasSuggestion(row: ValidationRow): boolean {
    const value = row.suggestion ?? row.suggestedName;
    return value != null && String(value).trim().length > 0;
  }

  isAcceptAsIs(row: ValidationRow): boolean {
    return this.bucket === 'flagged' && row.reason === 'No suggestion';
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
    if (this.bucket === 'flagged' && this.isAcceptAsIs(row)) {
      return row.tenantName;
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
    if (this.bucket === 'flagged') {
      return 'row-border--flagged';
    }
    return 'row-border--suggested';
  }

  onManualBlur(row: ValidationRow, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.manual.emit({ row, value });
  }

  onActionClick(event: Event): void {
    event.stopPropagation();
  }
}
