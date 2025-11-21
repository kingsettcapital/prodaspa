import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class FileService {
    private apiUrl = 'https://prodagatewaydev.kingsettcapital.com/Proda/download';

    constructor(private api: ApiService) { }

    downloadReport(date: string, projectName: string | null) {
        const payload = {
            xRentRollDate: date,
            xProjectName: projectName
        };
        return this.api.downloadReport(this.apiUrl, payload);
    }
}