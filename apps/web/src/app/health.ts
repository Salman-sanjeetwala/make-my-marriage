import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';

@Component({
  selector: 'mmm-health',
  templateUrl: './health.html',
})
export class Health implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly status = signal<'loading' | 'success' | 'failure'>('loading');

  ngOnInit(): void {
    this.checkConnection();
  }

  checkConnection(): void {
    this.status.set('loading');
    this.http
      .get<{ data?: { status?: string } } | null>('/api/health')
      .pipe(timeout(5000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) =>
          this.status.set(response?.data?.status === 'ok' ? 'success' : 'failure'),
        error: () => this.status.set('failure'),
      });
  }
}
