import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Health as App } from './health';

describe('connectivity check', () => {
  let fixture: ComponentFixture<App>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(App);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const content = () => (fixture.nativeElement as HTMLElement).textContent;
  const button = () => (fixture.nativeElement as HTMLElement).querySelector('button')!;

  it('shows loading then success from a relative GET request', () => {
    expect(content()).toContain('Checking connection');
    expect(button().disabled).toBe(true);
    const request = http.expectOne('/api/health');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { status: 'ok' } });
    fixture.detectChanges();
    expect(content()).toContain('Connected successfully');
    expect(button().disabled).toBe(false);
  });

  it('shows failure and allows a successful retry', () => {
    http.expectOne('/api/health').flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(content()).toContain('Unable to connect');
    button().click();
    fixture.detectChanges();
    expect(content()).toContain('Checking connection');
    http.expectOne('/api/health').flush({ data: { status: 'ok' } });
    fixture.detectChanges();
    expect(content()).toContain('Connected successfully');
  });

  it('does not treat an unexpected successful response as healthy', () => {
    http.expectOne('/api/health').flush({ data: { status: 'unexpected' } });
    fixture.detectChanges();
    expect(content()).toContain('Unable to connect');
  });

  it('times out a stalled request after five seconds and permits a successful retry', () => {
    // Finish the initial request before starting the timed retry with a controlled clock.
    http.expectOne('/api/health').flush({ data: { status: 'ok' } });
    fixture.detectChanges();
    vi.useFakeTimers();
    button().click();
    fixture.detectChanges();
    const stalled = http.expectOne('/api/health');

    vi.advanceTimersByTime(4999);
    fixture.detectChanges();
    expect(content()).toContain('Checking connection');
    expect(button().disabled).toBe(true);

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(stalled.cancelled).toBe(true);
    expect(content()).toContain('Unable to connect');
    expect(button().disabled).toBe(false);

    button().click();
    http.expectOne('/api/health').flush({ data: { status: 'ok' } });
    fixture.detectChanges();
    expect(content()).toContain('Connected successfully');
  });
});
