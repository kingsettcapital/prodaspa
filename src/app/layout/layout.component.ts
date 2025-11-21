import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { NavItem } from '../core/interfaces/nav-item.interface';
import { MatSidenav } from '@angular/material/sidenav';

@Component({
  selector: 'app-main-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss'],
})
export class LayoutComponent {

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
  ];

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
