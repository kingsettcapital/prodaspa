import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { FileDownloadComponent } from './file-download/file-download.component';

@NgModule({
  declarations: [
    AppComponent,
    FileDownloadComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule, // ⬅️ Add this
    HttpClientModule // ⬅️ Add this
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }