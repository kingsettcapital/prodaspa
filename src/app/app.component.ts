import { Component } from '@angular/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { MsalAuthService } from './core/services/msal-auth.service';
import { filter, Subject, takeUntil } from 'rxjs';
import { EventMessage, EventType, InteractionStatus } from '@azure/msal-browser';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  // protected readonly title = signal('prodaspa');
  private readonly _destroying$ = new Subject<void>();
  isMsalInitialized = false;
  ssoInProgress = false;
  imageLoaded = false;

  constructor(
    private msalService: MsalService,
    private msalBroadcastService: MsalBroadcastService,
    public msalAuth: MsalAuthService,
  ) { }

  async ngOnInit(): Promise<void> {
    this.msalAuth.ssoRedirectInProgress$.pipe(takeUntil(this._destroying$))
      .subscribe(value => this.ssoInProgress = value);

    await this.msalAuth.initMsal();

    this.msalBroadcastService.msalSubject$
      .pipe(
        filter((msg: EventMessage) => msg.eventType === EventType.INITIALIZE_START),
        takeUntil(this._destroying$)
      )
      .subscribe(() => {
        console.log('MSAL Initialization started');
      });

    this.msalBroadcastService.msalSubject$
      .pipe(
        filter((msg: EventMessage) => msg.eventType === EventType.INITIALIZE_END),
        takeUntil(this._destroying$)
      )
      .subscribe(() => {
        this.msalService.instance.enableAccountStorageEvents();
      });

    this.msalBroadcastService.inProgress$
      .pipe(takeUntil(this._destroying$))
      .subscribe(status => {
        console.log('MSAL Interaction Status:', status);
        if (status === InteractionStatus.Login) {
          this.msalAuth.setSsoEvent('login');
        } else if (status === InteractionStatus.Logout) {
          this.msalAuth.setSsoEvent('logout');
        } else if (status === InteractionStatus.None) {
          this.msalAuth.setSsoEvent('redirect');
        }
        localStorage.setItem('sso_event', status);
        if (status === InteractionStatus.Logout) {
          this.msalAuth.startSSORedirect();
        }
      });
  }

  ngOnDestroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }
}
