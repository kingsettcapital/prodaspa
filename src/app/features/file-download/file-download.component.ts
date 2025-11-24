import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormGroup, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { saveAs } from 'file-saver';
import { FileService } from 'src/app/core/services/file.service';

// 🛑 1. DEFINE THE CUSTOM VALIDATOR FUNCTION HERE (OUTSIDE THE CLASS)
const isFirstOfMonth = (control: AbstractControl): ValidationErrors | null => {
  const dateValue = control.value;

  if (!dateValue) {
    return null; 
  }

  const date = new Date(dateValue);

  // Check if the date is valid and the day is the 1st
  if (isNaN(date.getTime()) || date.getDate() !== 1) {
    return { notFirstOfMonth: true }; // Invalid
  }
  
  return null; // Valid
};
@Component({
  selector: 'app-file-download',
  standalone: false,
  templateUrl: './file-download.component.html',
  styleUrls: ['./file-download.component.scss']
})
export class FileDownloadComponent implements OnInit {
  @ViewChild('dateInput') dateInput!: ElementRef;
  reportForm = new FormGroup({
    rentRollDate: new FormControl('', [Validators.required,
      isFirstOfMonth
    ]),
    projectName: new FormControl('', [
      //Validators.required,                    // Now required
      Validators.pattern(/^([a-zA-Z\s])+$/)    // Improved pattern
    ]),
  });

  maxDate: Date;
  isDownloading = false;
  downloadMessage = '';
  isErrorMessage = false;

  constructor(
    private fileService: FileService) {
    this.maxDate = new Date();
  }

  ngOnInit(): void { }

  onDownloadFile(): void {
    if (this.reportForm.valid) {
      this.isDownloading = true;
      this.downloadMessage = 'Generating file...';
      const date = this.reportForm.value.rentRollDate;
      const projectName = this.reportForm.value.projectName ?? null;

      this.fileService.downloadReport(date!, projectName).subscribe({
        next: (response: any) => {
          const projectPart = (projectName && projectName.length > 0) ? projectName : 'AllProjects';
          const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // yyyyMMdd format
          const fileName = `RR_${projectPart}_${datePart}.xlsx`;
          saveAs(response.body, fileName);
          this.isDownloading = false;
          this.isErrorMessage = false;
          this.downloadMessage = 'File downloaded successfully!';
        },
        error: (error: any) => {
          this.isDownloading = false;
          this.isErrorMessage = true;
          this.downloadMessage = 'Error: Failed to download the file.';
          console.error('Download error:', error);
        }
      });
    } else {
      this.isErrorMessage = true;
      this.downloadMessage = 'Please fill out the form correctly.';
    }
  }

formatDateInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  let value = input.value;

  // 1. Remove ANY character that is NOT a digit
  value = value.replace(/\D/g, '');

  // 2. Auto-format: add slashes after day and month
  let formatted = '';
  if (value.length > 0) {
    formatted += value.substring(0, 2);
  }
  if (value.length >= 3) {
    formatted += '/' + value.substring(2, 4);
  }
  if (value.length >= 5) {
    formatted += '/' + value.substring(4, 8);
  }

  // 3. Limit to 8 digits (ddmmyyyy)
  if (value.length > 8) {
    value = value.substring(0, 8);
    formatted = formatted.substring(0, 10);
  }

  // 4. Update input field
  input.value = formatted;

  // 5. Update form control (silently)
  this.reportForm.get('rentRollDate')?.setValue(formatted, { emitEvent: false });
}

onKeyDown(event: KeyboardEvent): void {
  const allowedKeys = [
    'Backspace', 'Tab', 'End', 'Home', 'ArrowLeft', 'ArrowRight', 
    'Delete', 'Enter'
  ];

  // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
  if (event.ctrlKey || event.metaKey) {
    if (['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }
  }

  // Allow only numbers (0-9) and slash (/)
  if (!allowedKeys.includes(event.key) && 
      !((event.key >= '0' && event.key <= '9') || event.key === '/')) {
    event.preventDefault();
  }
}

onPaste(event: ClipboardEvent): void {
  const pasted = (event.clipboardData || (window as any).clipboardData).getData('text');
  const onlyNumbersAndSlash = /^[\d\/]+$/.test(pasted);

  if (!onlyNumbersAndSlash) {
    event.preventDefault();
  }
}
}
