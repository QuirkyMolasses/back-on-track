// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { App } from '../apps/web/src/App';
beforeEach(() => {
  localStorage.clear();
  location.hash = '';
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);
describe('German app and accessible course creation', () => {
  it('shows an honest empty workspace without sample courses', () => {
    render(<App />);
    expect(
      screen.getByText('Ein guter Plan beginnt mit einem Kurs.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('00')).toHaveLength(3);
  });
  it('creates and persists a course, showing missing-work state', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Kurs anlegen' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Kursname'), {
      target: { value: 'Algebra' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Kurs anlegen' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Algebra', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Noch kein gewichtetes Lernmaterial'),
    ).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('back-on-track:v1:local')!).courses[0]
        .name,
    ).toBe('Algebra');
  });
  it('can switch locale through centralized messages', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen' }));
    fireEvent.change(screen.getByLabelText('Sprache'), {
      target: { value: 'en' },
    });
    expect(
      screen.getByRole('heading', { name: 'Settings', level: 1 }),
    ).toBeInTheDocument();
  });
});
