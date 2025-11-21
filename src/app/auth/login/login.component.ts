import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  Validators,
  FormGroup,
  AbstractControl,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { MsalAuthService } from 'src/app/core/services/msal-auth.service';
import { EMAIL_PATTERN, PASSWORD_PATTERN } from 'src/app/core/constants/regex.constants';
import { ApiResponse } from 'src/app/core/interfaces/api-response.interface';
import { LoginResponse } from 'src/app/core/interfaces/auth-response.interface';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private notify: NotificationService,
    private msalAuth: MsalAuthService
  ) {}

  form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
  });

  error = '';
  loading = false;
  showPassword = false;

  get email(): AbstractControl | null {
    return this.form.get('email');
  }

  get password(): AbstractControl | null {
    return this.form.get('password');
  }

  submit(): void {
    this.error = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.value;
    this.loading = true;

    this.auth.login(email!, password!).subscribe({
      next: (res: ApiResponse<LoginResponse>) => {
        this.loading = false;
        if (res.isSuccess) {
          this.router.navigate(['/']);
        } else {
          this.error = res.message || 'Invalid credentials';
          this.notify.error(this.error);
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Login failed';
      },
    });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  loginSSO(): void {
    this.msalAuth.loginRedirect();
  }
}