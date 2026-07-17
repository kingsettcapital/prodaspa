import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { PropertyService } from 'src/app/core/services/property.service';

@Component({
  selector: 'app-add-property-dialog',
  standalone: false,
  templateUrl: './add-property-dialog.component.html',
  styleUrls: ['./add-property-dialog.component.scss']
})
export class AddPropertyDialogComponent {
  @ViewChild('propertyIdInput') propertyIdInput!: ElementRef<HTMLInputElement>;

  readonly spaceTypeOptions = [
    { code: 'OF', label: 'Office (OF)' },
    { code: 'RT', label: 'Retail (RT)' },
    { code: 'IND', label: 'Industrial (IND)' },
    { code: 'OTH', label: 'Other (OTH)' }
  ];

  form = new FormGroup({
    propertyId: new FormControl('', [Validators.required, Validators.maxLength(25)]),
    propertyName: new FormControl('', [Validators.required, Validators.maxLength(255)]),
    spaceTypeCode: new FormControl('', [Validators.required])
  });

  submitting = false;
  addedCount = 0;
  successMessage: string | null = null;
  errorMessage: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<AddPropertyDialogComponent, boolean>,
    private propertyService: PropertyService
  ) { }

  submit(): void {
    if (this.form.invalid || this.submitting) {
      return;
    }

    const propertyId = (this.form.value.propertyId ?? '').trim();
    const propertyName = (this.form.value.propertyName ?? '').trim();
    const spaceTypeCode = (this.form.value.spaceTypeCode ?? '').trim();

    this.submitting = true;
    this.errorMessage = null;

    this.propertyService.createProperty({ propertyId, propertyName, spaceTypeCode }).subscribe({
      next: () => {
        this.submitting = false;
        this.addedCount += 1;
        this.successMessage = `Added ${propertyName}.`;
        this.form.reset({
          propertyId: '',
          propertyName: '',
          spaceTypeCode: ''
        });
        setTimeout(() => this.propertyIdInput?.nativeElement?.focus(), 0);
      },
      error: (err: unknown) => {
        this.submitting = false;
        this.successMessage = null;
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.errorMessage = 'A property with this Property ID already exists.';
        } else {
          this.errorMessage = 'Could not add the property. Please try again.';
        }
      }
    });
  }

  done(): void {
    this.dialogRef.close(this.addedCount > 0);
  }
}
