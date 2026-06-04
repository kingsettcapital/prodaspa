import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { NavItem } from '../core/interfaces/nav-item.interface';
import { MatSidenav } from '@angular/material/sidenav';
import { filter, Subscription } from 'rxjs';

export interface HeaderTab {
  label: string;
  path: string;
}

@Component({
  selector: 'app-main-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss'],
})
export class LayoutComponent implements OnInit, OnDestroy {
  private routerEventsSub?: Subscription;

  currentUrl = '';

  readonly headerTabs: HeaderTab[] = [
    { label: 'Generate File', path: '/generate-file' },
    { label: 'Parent Tenant Mapping', path: '/validate' }
  ];

  constructor(
    public router: Router,
    public auth: AuthService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {}

  userName: string | null = null;
  userRole: string | null = null;
  menuOpened = false;
  selectedActivity: string | null = null;
  showCookieModal = false;

  navItems: NavItem[] = [
    { label: 'Generate File', icon: 'description', route: '/generate-file' },
    { label: 'Validate File', icon: 'rule', route: '/validate' }
  ];

  ngOnInit(): void {
    this.currentUrl = this.router.url;
    this.routerEventsSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.currentUrl = this.router.url;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.routerEventsSub?.unsubscribe();
  }

  isHeaderTabActive(path: string): boolean {
    const url = this.currentUrl.split('?')[0].split('#')[0];
    if (path === '/generate-file') {
      return url === '/generate-file' || url === '/';
    }
    return url === path || url.startsWith(path + '/');
  }

  isLoggedIn() {
    return this.auth.isAuthenticated();
  }

  logout() {
    this.auth.logout();
  }

  onProfileMenuClick(sidenav: MatSidenav): void {
    if (sidenav.mode === 'over' || window.innerWidth < 992) {
      sidenav.close();
    }
  }

  openChangePassword(sidenav: MatSidenav): void {
    this.onProfileMenuClick(sidenav);
  }
}
