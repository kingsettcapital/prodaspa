import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FileDownload } from './file-download';

describe('FileDownload', () => {
  let component: FileDownload;
  let fixture: ComponentFixture<FileDownload>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FileDownload]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FileDownload);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
