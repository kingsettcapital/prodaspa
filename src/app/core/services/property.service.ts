import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PropertyDto {
  propertyId: string;
  propertyName: string;
  spaceTypeCode: string;
}

@Injectable({ providedIn: 'root' })
export class PropertyService {
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

  getProperties(): Observable<PropertyDto[]> {
    return this.http.get<PropertyDto[]>(
      this.buildUrl('Property'),
      { headers: this.defaultHeaders() }
    );
  }

  deactivateProperty(propertyId: string): Observable<{ propertyId: string; status: string }> {
    return this.http.post<{ propertyId: string; status: string }>(
      this.buildUrl(`Property/${encodeURIComponent(propertyId)}/deactivate`),
      null,
      { headers: this.defaultHeaders() }
    );
  }

  updateProperty(
    propertyId: string,
    payload: { propertyName: string; spaceTypeCode: string }
  ): Observable<PropertyDto> {
    return this.http.put<PropertyDto>(
      this.buildUrl(`Property/${encodeURIComponent(propertyId)}`),
      payload,
      { headers: this.defaultHeaders() }
    );
  }

  createProperty(payload: {
    propertyId: string;
    propertyName: string;
    spaceTypeCode: string;
  }): Observable<PropertyDto> {
    return this.http.post<PropertyDto>(
      this.buildUrl('Property'),
      payload,
      { headers: this.defaultHeaders() }
    );
  }
}
