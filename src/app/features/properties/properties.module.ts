import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { PropertiesComponent } from './properties.component';
import { AddPropertyDialogComponent } from './add-property-dialog/add-property-dialog.component';
import { ConfirmDialogComponent } from './confirm-dialog/confirm-dialog.component';
import { EditPropertyDialogComponent } from './edit-property-dialog/edit-property-dialog.component';
import { SharedModule } from '../../shared/shared.module';

const routes: Routes = [
  { path: '', component: PropertiesComponent }
];

@NgModule({
  declarations: [
    PropertiesComponent,
    AddPropertyDialogComponent,
    ConfirmDialogComponent,
    EditPropertyDialogComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule]
})
export class PropertiesModule {}
