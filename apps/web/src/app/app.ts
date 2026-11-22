import { Component } from '@angular/core';
import { Home } from './home';
import { Health } from './health';
@Component({
  selector: 'mmm-root',
  imports: [Home, Health],
  template: '@if (healthPage) { <mmm-health /> } @else { <mmm-home /> }',
})
export class App {
  readonly healthPage = window.location.pathname === '/health';
}
