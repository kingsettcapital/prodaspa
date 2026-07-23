import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PropertyDto, PropertyService } from 'src/app/core/services/property.service';
import { AddPropertyDialogComponent } from './add-property-dialog/add-property-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog/confirm-dialog.component';
import { EditPropertyDialogComponent } from './edit-property-dialog/edit-property-dialog.component';

@Component({
  selector: 'app-properties',
  standalone: false,
  templateUrl: './properties.component.html',
  styleUrls: ['./properties.component.scss']
})
export class PropertiesComponent implements OnInit {
  displayedColumns = ['propertyId', 'propertyName', 'spaceTypeCode', 'actions'];
  dataSource = new MatTableDataSource<PropertyDto>([]);
  pageSize = 25;
  pageSizeOptions = [25, 50, 100];
  @ViewChild(MatPaginator)
  set paginator(value: MatPaginator) {
    if (value) {
      this.dataSource.paginator = value;
    }
  }

  @ViewChild(MatSort)
  set sort(value: MatSort) {
    if (value) {
      this.dataSource.sort = value;
    }
  }

  searchTerm = '';
  loading = true;
  error: string | null = null;

  constructor(
    private propertyService: PropertyService,
    private notification: NotificationService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.configureDataSource();
    this.loadProperties();
  }

  private configureDataSource(): void {
    // Digit runs are zero-padded so ordinary string comparison orders
    // addresses the way a person reads them: 10, 100, 101, 1175.
    // Without this, lexicographic sort gives 10, 100, 1175, 101.
    const naturalKey = (value: string): string =>
      (value ?? '').toLowerCase().replace(/\d+/g, m => m.padStart(10, '0'));

    this.dataSource.sortingDataAccessor = (row, columnId) => {
      switch (columnId) {
        case 'propertyId':
          return naturalKey(row.propertyId);
        case 'propertyName':
          return naturalKey(row.propertyName);
        case 'spaceTypeCode':
          return (row.spaceTypeCode ?? '').toLowerCase();
        default:
          return '';
      }
    };

    this.dataSource.filterPredicate = (row, filter) => {
      const criteria = JSON.parse(filter) as { search: string };
      const term = (criteria.search ?? '').trim().toLowerCase();
      if (!term) {
        return true;
      }
      return (row.propertyId ?? '').toLowerCase().includes(term)
        || (row.propertyName ?? '').toLowerCase().includes(term);
    };

    this.applySearch();
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

  editProperty(row: PropertyDto): void {
    const ref = this.dialog.open(EditPropertyDialogComponent, {
      width: '440px',
      autoFocus: true,
      data: row
    });

    ref.afterClosed().subscribe((updated: PropertyDto | undefined) => {
      if (!updated) {
        return;
      }

      // Update in place rather than refetching: the user is looking at this
      // row, and a refetch would reset scroll position for no benefit.
      this.dataSource.data = this.dataSource.data.map(r =>
        r.propertyId === updated.propertyId ? updated : r
      );
      this.notification.success('Property updated.');
    });
  }

  removeProperty(row: PropertyDto): void {
    const data: ConfirmDialogData = {
      title: 'Remove property?',
      message: `${row.propertyId} (${row.propertyName}) will be removed as an active property.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      tone: 'danger'
    };

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '440px',
      autoFocus: true,
      data
    });

    ref.afterClosed().subscribe((confirmed: boolean | undefined) => {
      if (confirmed) {
        this.performRemove(row);
      }
    });
  }

  private performRemove(row: PropertyDto): void {
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

  onSearchInput(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applySearch();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.applySearch();
  }

  private applySearch(): void {
    this.dataSource.filter = JSON.stringify({ search: this.searchTerm });
    // Without this, filtering while on a later page leaves the user
    // looking at an empty table.
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  get rowCount(): number {
    return this.dataSource.filteredData.length;
  }

  get totalCount(): number {
    return this.dataSource.data.length;
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
