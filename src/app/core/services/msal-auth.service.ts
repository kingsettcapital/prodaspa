import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';
import { AuthenticationResult, SilentRequest } from '@azure/msal-browser';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, filter, firstValueFrom, take } from 'rxjs';

const SSO_TOKEN_KEY = 'ks_sso_token';
const SSO_EXP_KEY = 'ks_sso_token_exp';

@Injectable({ providedIn: 'root' })
export class MsalAuthService {
  private router = inject(Router);
  private msalService = inject(MsalService);
  private msalReadySubject = new BehaviorSubject<boolean>(false);
  public msalReady$ = this.msalReadySubject.asObservable();
  private _ssoRedirectInProgress = new BehaviorSubject<boolean>(false);
  public ssoRedirectInProgress$ = this._ssoRedirectInProgress.asObservable();
  private _ssoEvent = new BehaviorSubject<string | null>(null);
  public ssoEvent$ = this._ssoEvent.asObservable();

  get ssoEvent(): string | null {
    return this._ssoEvent.value;
  }

  setSsoEvent(event: string | null) {
    this._ssoEvent.next(event);
  }

  public startSSORedirect() {
    const event = localStorage.getItem('sso_event');
    if (event) {
      this._ssoEvent.next(event);
      localStorage.removeItem('sso_event');
    }
    if (this.ssoEvent === 'login' || this.ssoEvent === 'redirect' || this.ssoEvent === 'logout') {
      this._ssoRedirectInProgress.next(true);
    }
  }

  public stopSSORedirect() {
    this._ssoRedirectInProgress.next(false);
    this._ssoEvent.next(null);
  }

  markMsalReady() {
    this.msalReadySubject.next(true);
  }

  isMsalReady(): boolean {
    return this.msalReadySubject.value;
  }

  storeSSOToken(result: AuthenticationResult): void {
    const expiresOn = result.expiresOn?.getTime() || 0;
    localStorage.setItem(SSO_TOKEN_KEY, result.accessToken);
    localStorage.setItem(SSO_EXP_KEY, expiresOn.toString());
  }

  getSSOToken(): string | null {
    return localStorage.getItem(SSO_TOKEN_KEY);
  }

  clearSSOToken(): void {
    localStorage.removeItem(SSO_TOKEN_KEY);
    localStorage.removeItem(SSO_EXP_KEY);
  }

  isSSOUser(): boolean {
    return this.msalService.instance.getAllAccounts().length > 0;
  }

  async trySilentSSO(): Promise<void> {
    const token = this.getSSOToken();
    if (token && Date.now() < Number(localStorage.getItem(SSO_EXP_KEY) || '0')) return;

    const accounts = this.msalService.instance.getAllAccounts();
    if (!accounts.length) return;

    const silentRequest: SilentRequest = {
      account: accounts[0],
      scopes: [environment.azureConfig.scopes],
    };

    try {
      const result: AuthenticationResult =
        await this.msalService.instance.acquireTokenSilent(silentRequest);
      if (result.accessToken) {
        this.storeSSOToken(result);
        this.router.navigate(['/']);
      }
    } catch (err) {
      console.warn('Silent SSO failed:', err);
      this.clearSSOToken();
    }
  }

  async handleRedirect(): Promise<void> {
    const result = await this.msalService.instance.handleRedirectPromise();
    if (result?.account) {
      this.msalService.instance.setActiveAccount(result.account);
      this.storeSSOToken(result);
      this.router.navigate(['/']);
    }
  }

  clearStaleMsalState(): void {
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('msal.') || k.includes('interaction.status'))
        .forEach(k => sessionStorage.removeItem(k));

      Object.keys(localStorage)
        .filter(key => key.startsWith('msal.') || key.includes('interaction.status'))
        .forEach(key => localStorage.removeItem(key));
    } catch (err) {
      console.error('Error clearing stale MSAL cache:', err);
    }
  }

  logout(): void {
    this.clearSSOToken();
    this.msalService.logoutRedirect({
      postLogoutRedirectUri: '/auth/login'
    });
  }

  async checkAndSetActiveAccount() {
    const accounts = this.msalService.instance.getAllAccounts();
    if (!this.msalService.instance.getActiveAccount() && accounts.length > 0) {
      this.msalService.instance.setActiveAccount(accounts[0]);
      await this.trySilentSSO();
    }
  }

  isTokenValid(): boolean {
    const token = this.getSSOToken();
    const exp = Number(localStorage.getItem(SSO_EXP_KEY) || '0');
    return !!token && Date.now() < exp;
  }

  loginRedirect(): void {
    this.clearStaleMsalState();
    this.msalService.loginRedirect({
      scopes: [environment.azureConfig.scopes],
      prompt: 'select_account',
    });
  }

  async initMsal(): Promise<void> {
    this.startSSORedirect();
    try {
      await this.handleRedirect();
      await this.checkAndSetActiveAccount();
    } catch (err) {
      console.warn('MSAL init failed', err);
      this.clearSSOToken();
    } finally {
      this.markMsalReady();
      this.stopSSORedirect();
    }
  }

  async waitForMsalReady(): Promise<void> {
    if (this.isMsalReady()) return;
    await firstValueFrom(
      this.msalReady$.pipe(
        filter(v => v),
        take(1)
      )
    );
  }
}
