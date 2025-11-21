import { inject, Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MsalAuthService } from '../services/msal-auth.service';
import { Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
    private msal = inject(MsalService);
    private router = inject(Router);
    private msalAuth = inject(MsalAuthService);

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {

        if (error.status === 401) {
            console.error(error);
            const accounts = this.msal.instance.getAllAccounts();

            if (!accounts.length) {
                this.msal.logoutRedirect({
                    postLogoutRedirectUri: '/auth/login'
                });
            } else {
                this.msalAuth.trySilentSSO();
            }
        }

        if (error.status === 403) {
          console.warn('⚠ 403: User does not have permission.');
          console.error(error);
        }

        if (error.status == 500) {
          console.error(error);
        }

        if (error.status == 0) {
            console.error('Network error: Please check your internet connection or try again later.');
        }
        const errorMessage = error.error.message || error.statusText;
        console.log(errorMessage);
        return throwError(() => error);
      })
    );
  }
}
