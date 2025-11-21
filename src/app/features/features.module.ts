import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FileDownloadComponent } from './file-download/file-download.component';
import { SharedModule } from '../shared/shared.module';

const routes: Routes = [
  { path: 'generate-file', component: FileDownloadComponent },
  { path: '', redirectTo: 'generate-file', pathMatch: 'full' }
];

@NgModule({
  declarations: [
    FileDownloadComponent
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule]
})
export class FeaturesModule {}
