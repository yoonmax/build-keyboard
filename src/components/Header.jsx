import { ROUTES, navigate, useRoute } from '../app/routes.js';
import { saveCurrentBuild } from '../app/actions.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { useSettings } from '../state/settingsStore.js';

export function Header() {
  const route = useRoute();
  const name = useConfigurator((s) => s.build.name);
  const unsaved = useConfigurator((s) => s.unsaved);
  const rename = useConfigurator((s) => s.rename);
  const setUi = useConfigurator((s) => s.setUi);
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);

  return (
    <header className="header" data-reveal="top">
      <a
        href="#/configure"
        className="wordmark"
        aria-label="BUILD, go to the configurator"
        data-testid="wordmark"
        onClick={() => navigate('configure')}
      >
        BUILD
      </a>
      <nav aria-label="Main" className="main-nav">
        {ROUTES.map((r) => (
          <a
            key={r.id}
            href={`#/${r.id}`}
            className="nav-link"
            aria-current={route === r.id ? 'page' : undefined}
            data-testid={`nav-${r.id}`}
          >
            {r.label}
          </a>
        ))}
      </nav>
      <div className="header-right">
        <label className="build-name">
          <span className="sr-only">Build name</span>
          <input
            value={name}
            maxLength={60}
            data-testid="build-name"
            onChange={(e) => rename(e.target.value)}
            onBlur={(e) => {
              if (!e.target.value.trim()) rename('Untitled build');
            }}
            size={Math.max(8, Math.min(28, name.length + 2))}
          />
          {unsaved ? <span className="unsaved" title="Not saved yet" aria-label="Not saved yet" /> : null}
        </label>
        <button
          type="button"
          className="header-icon"
          aria-label={appearance === 'dark' ? 'Use light mode' : 'Use dark mode'}
          data-testid="toggle-appearance"
          onClick={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="header-button" data-testid="save" onClick={() => saveCurrentBuild()}>
          Save
        </button>
        <button type="button" className="header-button header-button-solid" data-testid="export" onClick={() => setUi({ exportOpen: true })}>
          Export
        </button>
      </div>
    </header>
  );
}
