import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  BatchValidationResult,
  DownloadCorrectionsPayload,
  DraftDetail,
  DraftSummary,
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

  getDrafts(): Observable<DraftSummary[]> {
    return this.http.get<DraftSummary[]>(
      this.buildUrl('Validation/drafts'),
      { headers: this.defaultHeaders() }
    );
  }

  getDraft(fileId: string): Observable<DraftDetail> {
    return this.http.get<DraftDetail>(
      this.buildUrl(`Validation/draft/${encodeURIComponent(fileId)}`),
      { headers: this.defaultHeaders() }
    );
  }

  saveDraft(
    file: File,
    fileId: string,
    fileName: string,
    resultsJson: string,
    decisionsJson: string
  ): Observable<{ fileId: string; id: number; status: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('draftJson', JSON.stringify({
      fileId,
      fileName,
      resultsJson,
      decisionsJson
    }));
    return this.http.post<{ fileId: string; id: number; status: string }>(
      this.buildUrl('Validation/save-draft'),
      formData,
      { headers: this.defaultHeaders() }
    );
  }

  discardDraft(fileId: string): Observable<{ fileId: string; status: string }> {
    return this.http.post<{ fileId: string; status: string }>(
      this.buildUrl(`Validation/draft/${encodeURIComponent(fileId)}/discard`),
      {},
      { headers: this.defaultHeaders() }
    );
  }

  updateDraftDecisions(
    fileId: string,
    decisionsJson: string
  ): Observable<{ fileId: string; status: string }> {
    return this.http.patch<{ fileId: string; status: string }>(
      this.buildUrl(`Validation/draft/${encodeURIComponent(fileId)}/decisions`),
      { decisionsJson },
      { headers: this.defaultHeaders() }
    );
  }

  clearDraft(fileId: string): Observable<{ fileId: string; status: string }> {
    return this.http.post<{ fileId: string; status: string }>(
      this.buildUrl(`Validation/draft/${encodeURIComponent(fileId)}/clear`),
      null,
      { headers: this.defaultHeaders() }
    );
  }
}
