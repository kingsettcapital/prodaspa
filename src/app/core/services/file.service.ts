import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FileService {
    private apiUrl = environment.apiUrl.replace(/\/api\/?$/, '') + '/Proda/download';

    constructor(private api: ApiService) { }

    downloadReport(date: string, projectName: string | null) {
        const payload = {
            xRentRollDate: date,
            xProjectName: projectName
        };
        return this.api.downloadReport(this.apiUrl, payload);
    }
}
