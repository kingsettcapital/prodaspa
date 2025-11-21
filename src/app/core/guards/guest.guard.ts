import { Injectable, inject } from '@angular/core';
import { CanActivateChild, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class GuestGuard implements CanActivateChild {

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  canActivateChild(): boolean | UrlTree {
    return this.auth.isAuthenticated() ? this.router.parseUrl('/upload-history') : true;
  }
}