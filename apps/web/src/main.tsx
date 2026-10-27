import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Back on Track</h1>
        <p>
          Die Ansicht konnte nicht geladen werden. Deine gespeicherten Daten
          bleiben erhalten.
        </p>
        <button onClick={() => location.reload()}>Neu laden</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
