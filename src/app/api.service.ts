import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment'; 


@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'https://prodagatewaydev.kingsettcapital.com/Proda/download'
  //'https://localhost:7030/Proda/download'
  //'https://prodagatewaydev.kingsettcapital.com/Proda/query-proda-data';

  constructor(private http: HttpClient) { }

  downloadReport(date: string, projectName: string | null): Observable<any> {
    // Create headers object and add the API key
    const headers = new HttpHeaders({
      'X-Api-Key': environment.apiKey
    });
    const body = {
      xRentRollDate: date,
      xProjectName: projectName
    };
    return this.http.post(this.apiUrl, body, {
      headers: headers,
      responseType: 'blob',
      observe: 'response'
    });
  }
}