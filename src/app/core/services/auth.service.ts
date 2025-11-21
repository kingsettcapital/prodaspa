import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { tap } from 'rxjs/operators';
import { Observable, Subject } from 'rxjs';
import { ApiResponse } from '../interfaces/api-response.interface';
import { ForgotPasswordResponse, LoginResponse, ResetPasswordResponse, ResendMfaCodeResponse, MfaResponse } from '../interfaces/auth-response.interface';
import { MsalAuthService } from './msal-auth.service';

const TOKEN_KEY = 'ks_token';
const EXP_KEY = 'ks_token_exp';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _lastLoginUserId: number | null = null;
  private _lastLoginEmail: string | null = null;
  public authCompleted$ = new Subject<void>();

  constructor(
    private api: ApiService,
    private router: Router,
    private msalAuth: MsalAuthService
  ) {}

  login(email: string, password: string): Observable<ApiResponse<LoginResponse>> {
    return this.api.post<ApiResponse<LoginResponse>>('/auth/login', { email, password }).pipe(
      tap(res => {
        if (res.isSuccess && res.data?.userId) {
          this._lastLoginUserId = res.data.userId;
          this._lastLoginEmail = email;
        }
      })
    );
  }

  get lastLoginUserId(): number | null {
    return this._lastLoginUserId;
  }

  get lastLoginEmail(): string | null {
    return this._lastLoginEmail;
  }

  logout(): void {
    if (this.msalAuth.isSSOUser()) {
      this.msalAuth.logout();
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      this.router.navigate(['/auth/login']);
    }
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    if (this.msalAuth.isSSOUser()) {;
      if (this.msalAuth.isTokenValid()) {
        return true;
      }
      try {
        this.msalAuth.trySilentSSO();
        return this.msalAuth.isTokenValid();
      } catch {
        return false;
      }
    } else {
      const token = this.getToken();
      const exp = Number(localStorage.getItem(EXP_KEY) || '0');
      return !!token && Date.now() < exp;
    }
  }
}