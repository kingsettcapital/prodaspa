import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PropertyDto, PropertyService } from 'src/app/core/services/property.service';
import { AddPropertyDialogComponent } from './add-property-dialog/add-property-dialog.component';

@Component({
  selector: 'app-properties',
  standalone: false,
  templateUrl: './properties.component.html',
  styleUrls: ['./properties.component.scss']
})
export class PropertiesComponent implements OnInit {
  displayedColumns = ['propertyId', 'propertyName', 'spaceTypeCode', 'actions'];
  dataSource = new MatTableDataSource<PropertyDto>([]);
  loading = true;
  error: string | null = null;

  constructor(
    private propertyService: PropertyService,
    private notification: NotificationService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.loadProperties();
  }

  openAddProperty(): void {
    const ref = this.dialog.open(AddPropertyDialogComponent, {
      width: '440px',
      autoFocus: true,
      disableClose: false,
      panelClass: 'add-property-dialog-panel'
    });

    ref.afterClosed().subscribe((added: boolean | undefined) => {
      if (added) {
        this.loadProperties();
      }
    });
  }

  removeProperty(row: PropertyDto): void {
    this.propertyService.deactivateProperty(row.propertyId).subscribe({
      next: () => {
        this.dataSource.data = this.dataSource.data.filter(
          r => r.propertyId !== row.propertyId
        );
        this.notification.success('Property removed.');
      },
      error: () => {
        this.notification.error('Could not remove the property. Please try again.');
      }
    });
  }

  applyFilter(event: Event): void {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim().toLowerCase();
  }

  get rowCount(): number {
    return this.dataSource.filteredData.length;
  }

  private loadProperties(): void {
    this.loading = true;
    this.error = null;
    this.propertyService.getProperties().subscribe({
      next: (rows) => {
        this.dataSource.data = rows;
        this.loading = false;
      },
      error: () => {
        this.error = 'Unable to load properties. Please try again.';
        this.loading = false;
      }
    });
  }
}
