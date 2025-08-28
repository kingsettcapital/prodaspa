import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { saveAs } from 'file-saver';
import {ApiService} from '../api.service';

@Component({
  selector: 'app-file-download',
  standalone: false,
  templateUrl: './file-download.component.html',
  styleUrl: './file-download.component.css'
})
export class FileDownloadComponent implements OnInit {
  reportForm = new FormGroup({
    rentRollDate: new FormControl('', [Validators.required]),
    projectName: new FormControl('', [Validators.pattern(/^[a-zA-Z\s]*$/)])
  });

  maxDate: string;
  isDownloading = false;
  downloadMessage = '';

  constructor(private apiService: ApiService) {
    this.maxDate = new Date().toISOString().split('T')[0];
  }

  ngOnInit(): void {}

  onDownloadFile(): void {
    if (this.reportForm.valid) {
      this.isDownloading = true;
      this.downloadMessage = 'Generating file...';
      const date = this.reportForm.value.rentRollDate;
      const projectName = this.reportForm.value.projectName;

      this.apiService.downloadReport(date!, projectName!).subscribe({
        next: (response: any) => {
          const projectPart = projectName && projectName.length > 0 ? projectName : 'AllProjects';
          const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // yyyyMMdd format
          const fileName = `RR_${projectPart}_${datePart}.xlsx`;
          saveAs(response.body, fileName);
          this.isDownloading = false;
          this.downloadMessage = 'File downloaded successfully!';
        },
        error: (error: any) => {
          this.isDownloading = false;
          this.downloadMessage = 'Error: Failed to download the file.';
          console.error('Download error:', error);
        }
      });
    } else {
      this.downloadMessage = 'Please fill out the form correctly.';
    }
  }
}
