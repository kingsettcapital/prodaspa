import { Directive, HostListener } from '@angular/core';

@Directive({
  selector: '[appOnlyNumbers]'
})
export class OnlyNumbersDirective {

  @HostListener('keypress', ['$event'])
  onKeyPress(event: KeyboardEvent) {
    const allowedKeys = [
      '0','1','2','3','4','5','6','7','8','9',
      'Backspace','ArrowLeft','ArrowRight','Delete','Tab'
    ];
    if (!allowedKeys.includes(event.key)) {
      event.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent) {
    const pastedData = event.clipboardData?.getData('text') || '';
    if (!/^\d*$/.test(pastedData)) {
      event.preventDefault();
    }
  }
}
