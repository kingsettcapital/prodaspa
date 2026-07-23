import { HttpErrorResponse } from '@angular/common/http';
import { Component, Inject } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PropertyDto, PropertyService } from 'src/app/core/services/property.service';
import { SpaceTypeOption, spaceTypeOptionsFor } from '../space-types';

@Component({
  selector: 'app-edit-property-dialog',
  standalone: false,
  templateUrl: './edit-property-dialog.component.html',
  styleUrls: ['./edit-property-dialog.component.scss']
})
export class EditPropertyDialogComponent {
  readonly spaceTypeOptions: SpaceTypeOption[];

  form = new FormGroup({
    propertyName: new FormControl('', [Validators.required, Validators.maxLength(255)]),
    spaceTypeCode: new FormControl('', [Validators.required])
  });

  submitting = false;
  errorMessage: string | null = null;

  private readonly originalName: string;
  private readonly originalSpaceType: string;

  constructor(
    private dialogRef: MatDialogRef<EditPropertyDialogComponent, PropertyDto | undefined>,
    private propertyService: PropertyService,
    @Inject(MAT_DIALOG_DATA) public property: PropertyDto
  ) {
    this.originalName = this.property.propertyName ?? '';
    this.originalSpaceType = this.property.spaceTypeCode ?? '';

    // Surfaces a non-canonical stored code as a preselected option so the
    // user can edit the name without silently overwriting the space type.
    this.spaceTypeOptions = spaceTypeOptionsFor(this.originalSpaceType);

    this.form.setValue({
      propertyName: this.originalName,
      spaceTypeCode: this.originalSpaceType
    });
  }

  get isDirty(): boolean {
    const name = (this.form.value.propertyName ?? '').trim();
    const spaceType = (this.form.value.spaceTypeCode ?? '').trim();
    return name !== this.originalName.trim() || spaceType !== this.originalSpaceType.trim();
  }

  get canSave(): boolean {
    return this.form.valid && !this.submitting && this.isDirty;
  }

  submit(): void {
    if (!this.canSave) {
      return;
    }

    const propertyName = (this.form.value.propertyName ?? '').trim();
    const spaceTypeCode = (this.form.value.spaceTypeCode ?? '').trim();

    this.submitting = true;
    this.errorMessage = null;

    this.propertyService
      .updateProperty(this.property.propertyId, { propertyName, spaceTypeCode })
      .subscribe({
        next: (updated: PropertyDto) => {
          this.submitting = false;
          this.dialogRef.close(updated);
        },
        error: (err: unknown) => {
          this.submitting = false;
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.errorMessage =
              'This property no longer exists or has been removed. Close and refresh the list.';
          } else if (err instanceof HttpErrorResponse && err.status === 400) {
            this.errorMessage = 'Please check the property name and space type.';
          } else {
            this.errorMessage = 'Could not save changes. Please try again.';
          }
        }
      });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
