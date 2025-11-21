import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl.replace(/\/+$/, '');
  private http = inject(HttpClient);

  private defaultHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    if (!environment.production) {
      headers = headers.set('ngrok-skip-browser-warning', '69420');
    }
    return headers;
  }

  get<T>(path: string, params?: Record<string, string | number | boolean>, extraHeaders?: HttpHeaders): Observable<T> {
    const httpParams = params
      ? new HttpParams({
          fromObject: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
        })
      : undefined;
    const url = `${this.base}/${path.replace(/^\/+/, '')}`;
    let headers = this.defaultHeaders();

    if (extraHeaders) {
      extraHeaders.keys().forEach(key => {
        const value = extraHeaders.get(key);
        if (value) headers = headers.set(key, value);
      });
    }
    return this.http.get<T>(url, { params: httpParams, headers });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    const url = `${this.base}/${path.replace(/^\/+/, '')}`;
    let headers = this.defaultHeaders();
    if (!(body instanceof FormData)) {
      headers = headers.set('Content-Type', 'application/json');
    }
    return this.http.post<T>(url, body, { headers });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    const url = `${this.base}/${path.replace(/^\/+/, '')}`;
    const headers = this.defaultHeaders().set('Content-Type', 'application/json');
    return this.http.put<T>(url, body, { headers });
  }

  delete<T>(path: string): Observable<T> {
    const url = `${this.base}/${path.replace(/^\/+/, '')}`;
    const headers = this.defaultHeaders();
    return this.http.delete<T>(url, { headers });
  }

  downloadFile(path: string): Observable<HttpResponse<Blob>> {
    const url = `${this.base}/${path.replace(/^\/+/, '')}`;
    const headers = this.defaultHeaders();
    return this.http.get(url, {
      headers,
      responseType: 'blob',
      observe: 'response'
    });
  }

  downloadReport(path: string, body?: unknown): Observable<any> {
    const headers = this.defaultHeaders().set('X-Api-Key', environment.apiKey);
    return this.http.post(path, body, {
      headers: headers,
      responseType: 'blob',
      observe: 'response'
    });
  }

}