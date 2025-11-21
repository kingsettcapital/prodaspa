import { NgModule } from '@angular/core';
import { AuthShellComponent } from './auth.component';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { SharedModule } from '../shared/shared.module';


const routes: Routes = [
  {
    path: '',
    component: AuthShellComponent,
    children: [
      { path: 'login', component: LoginComponent },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ]
  }
];


@NgModule({
  declarations: [
    AuthShellComponent,
    LoginComponent
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes)
    ],
  exports: [AuthShellComponent]
})
export class AuthModule {}
