import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  BatchValidationResult,
  DownloadCorrectionsPayload,
  ValidationHistory
} from '../models/validation.models';

@Injectable({ providedIn: 'root' })
export class ValidationApiService {
  private readonly base = environment.validationApiUrl.replace(/\/+$/, '');
  private readonly http = inject(HttpClient);

  private defaultHeaders(): HttpHeaders {
    let headers = new HttpHeaders().set('X-Api-Key', environment.apiKey);
    if (!environment.production) {
      headers = headers.set('ngrok-skip-browser-warning', '69420');
    }
    return headers;
  }

  private buildUrl(path: string): string {
    return `${this.base}/${path.replace(/^\/+/, '')}`;
  }

  validateBatch(files: File[]): Observable<BatchValidationResult[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return this.http.post<BatchValidationResult[]>(
      this.buildUrl('Validation/validate-batch'),
      formData,
      { headers: this.defaultHeaders() }
    );
  }

  downloadCorrected(file: File, payload: DownloadCorrectionsPayload): Observable<Blob> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('correctionsJson', JSON.stringify(payload));
    return this.http.post(
      this.buildUrl('Validation/download-corrected'),
      formData,
      {
        headers: this.defaultHeaders(),
        responseType: 'blob'
      }
    );
  }

  getHistory(): Observable<ValidationHistory[]> {
    return this.http.get<ValidationHistory[]>(
      this.buildUrl('Validation/history'),
      { headers: this.defaultHeaders() }
    );
  }
}
