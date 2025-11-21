import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private snackbar: MatSnackBar) {}

  private defaultConfig = {
    horizontalPosition: 'end' as const,
    verticalPosition: 'top' as const,
    panelClass: ['custom-snackbar'],
  };

  success(message: string, duration = 4000): void {
    this.snackbar.open(message, 'Close', {
      ...this.defaultConfig,
      duration,
      panelClass: [...this.defaultConfig.panelClass, 'ns-success'],
    });
  }

  error(message: string, duration = 6000): void {
    this.snackbar.open(message, 'Close', {
      ...this.defaultConfig,
      duration,
      panelClass: [...this.defaultConfig.panelClass, 'ns-error'],
    });
  }

  info(message: string, duration = 4000): void {
    this.snackbar.open(message, 'Close', {
      ...this.defaultConfig,
      duration,
      panelClass: [...this.defaultConfig.panelClass, 'ns-info'],
    });
  }

  // success(message: string, duration = 4000): void {
  //   this.snack.open(message, 'Close', { duration, panelClass: ['ns-success'], horizontalPosition: 'end', verticalPosition: 'top' });
  // }

  // error(message: string, duration = 6000): void {
  //   this.snack.open(message, 'Close', { duration, panelClass: ['ns-error'], horizontalPosition: 'end', verticalPosition: 'top' });
  // }
}