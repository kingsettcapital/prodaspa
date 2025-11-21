import { Injectable, inject } from '@angular/core';
import { CanActivate, CanActivateChild, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MsalAuthService } from '../services/msal-auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild {

  constructor(
    private auth: AuthService,
    private router: Router,
    private msalAuth: MsalAuthService
  ) {}

  private async check(): Promise<boolean | UrlTree>  {
    await this.msalAuth.waitForMsalReady();
    const authenticated = this.auth.isAuthenticated();
    if (!authenticated) {
      return this.router.parseUrl('/auth/login');
    }

    return true;
  }

  async canActivate(): Promise<boolean | UrlTree> {
    return this.check();
  }

  async canActivateChild(): Promise<boolean | UrlTree> {
    return this.check();
  }
}