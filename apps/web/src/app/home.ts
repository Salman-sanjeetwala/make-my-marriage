import { Component, signal } from '@angular/core';

@Component({ selector: 'mmm-home', templateUrl: './home.html' })
export class Home {
  readonly year = new Date().getFullYear();
  readonly openFaq = signal<number | null>(null);
  toggleFaq(index: number): void {
    this.openFaq.update((current) => (current === index ? null : index));
  }
}
