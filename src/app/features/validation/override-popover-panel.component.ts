import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';

@Component({
  selector: 'app-override-popover-panel',
  templateUrl: './override-popover-panel.component.html',
  styleUrls: ['./override-popover-panel.component.scss']
})
export class OverridePopoverPanelComponent implements OnInit, AfterViewInit {
  @Input() originalName = '';
  @Input() initialValue = '';
  @Input() placeholder = 'Correct name';

  @Output() save = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('draftInput') draftInput?: ElementRef<HTMLInputElement>;

  draftValue = '';

  ngOnInit(): void {
    this.draftValue = this.initialValue;
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      const input = this.draftInput?.nativeElement;
      if (!input) {
        return;
      }
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }

  onSave(): void {
    this.save.emit(this.draftValue);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
