import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpResponse,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { ApiResponse } from '../interfaces/api-response.interface';
import { MsalAuthService } from '../services/msal-auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private auth: AuthService,
    private msalAuth: MsalAuthService,
    private notify: NotificationService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.msalAuth.isSSOUser() ? this.msalAuth.getSSOToken() : this.auth.getToken();
    const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

    return next.handle(authReq).pipe(
      map(event => {
        if (event instanceof HttpResponse) {
          const body = event.body as ApiResponse | undefined;
          if (body && typeof body.isSuccess === 'boolean') {
            if (!body.isSuccess) {
              this.notify.error(body.message ?? 'Request failed');
              throw new HttpErrorResponse({
                error: body,
                status: body.status ?? 400,
                statusText: body.message ?? 'Server error',
                url: event.url ?? req.url,
              });
            }
          }
        }
        return event;
      }),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse) {
          if (err.status === 401 && this.auth.getToken()) {
            this.notify.error('Session expired. Please sign in again.');
            this.auth.logout();
          } else {
            this.notify.error(err?.error?.message || 'Something went wrong');
          }
        } else {
          this.notify.error('Unexpected error occurred');
        }
        return throwError(() => err);
      })
    );
  }
}
