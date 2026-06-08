import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ValidationComponent } from './validation.component';
import { ValidationResultTableComponent } from './validation-result-table.component';
import { OverridePopoverPanelComponent } from './override-popover-panel.component';
import { SharedModule } from '../../shared/shared.module';

const routes: Routes = [
  { path: '', component: ValidationComponent }
];

@NgModule({
  declarations: [
    ValidationComponent,
    ValidationResultTableComponent,
    OverridePopoverPanelComponent
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule]
})
export class ValidationModule {}
