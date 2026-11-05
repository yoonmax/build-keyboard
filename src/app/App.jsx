import gsap from 'gsap';
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExplorePanel } from '../components/ExplorePanel.jsx';
import { Header } from '../components/Header.jsx';
import { Inspector } from '../components/Inspector.jsx';
import { KeyboardTester, useAudioSync } from '../components/KeyboardTester.jsx';
import { ExportSheet, SpecSheet, Toast } from '../components/Sheets.jsx';
import { Sidebar } from '../components/Sidebar.jsx';
import { StudioPanel } from '../components/StudioPanel.jsx';
import { SwitchInspector } from '../components/SwitchInspector.jsx';
import { Toolbar } from '../components/Toolbar.jsx';
import { KeyboardScene } from '../configurator/KeyboardScene.jsx';
import { dropKeycaps, runtime, touch } from '../configurator/runtime.js';
import { getLayout } from '../layouts/index.js';
import { getBackdrop } from '../materials/LightingPresets.js';
import { About } from '../pages/About.jsx';
import { Gallery } from '../pages/Gallery.jsx';
import { useConfigurator } from '../state/configuratorStore.js';
import { useSettings } from '../state/settingsStore.js';
import { keyboardAudio } from '../audio/KeyboardAudio.js';
import { renderThumbnail } from '../export/ImageExporter.js';
import { useAutoQuality } from './quality.js';
import { useRoute } from './routes.js';

/** Keeps a failure in the 3D view from blanking the page, and says what to do. */
class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <h1>The 3D view stopped working</h1>
        <p>Your build is still in memory. Reload the page to restart the view. Saved builds are safe.</p>
      </div>
    );
  }
}

const params = new URLSearchParams(window.location.search);
const SKIP_INTRO = params.has('instant') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE_QUERY = '(max-width: 860px)';

/** Tells the renderer where the panels are, so that the product stays centred in the open space. */
function usePanelMetrics(route) {
  // Individual values, so selecting a key doesn't re-render the whole app.
  const cinematic = useConfigurator((s) => s.ui.cinematic);
  const leftOpen = useConfigurator((s) => s.ui.leftOpen);
  const rightOpen = useConfigurator((s) => s.ui.rightOpen);
  const studioOpen = useConfigurator((s) => s.ui.studioOpen);
  const testerOpen = useConfigurator((s) => s.ui.testerOpen);
  const [mobile, setMobile] = useState(() => matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const query = matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    if (mobile) {
      useConfigurator.setState((s) => (s.ui.mobileInit ? s : { ui: { ...s.ui, mobileInit: true, leftOpen: false, rightOpen: false } }));
    }
  }, [mobile]);

  useLayoutEffect(() => {
    const view = runtime.view;
    let left = 0;
    let right = 0;
    let top = 56;
    let bottom = 76;
    const panelsVisible = (route === 'configure' || route === 'explore') && !cinematic;
    if (mobile) {
      top = 82;
      bottom = panelsVisible && (leftOpen || rightOpen || studioOpen) ? window.innerHeight * 0.52 : 104;
      if (testerOpen) bottom = 230;
    } else if (panelsVisible) {
      left = leftOpen && !studioOpen ? 344 : 0;
      right = rightOpen || studioOpen ? 316 : 0;
      if (testerOpen) bottom = 210;
    } else {
      top = 0;
      bottom = 0;
    }
    view.panels = { left, right, top, bottom };
    view.targetShiftX = (left - right) / 2;
    view.targetShiftY = (top - bottom) / 2;
    touch('full');
    runtime.invalidate();
  }, [route, cinematic, leftOpen, rightOpen, studioOpen, testerOpen, mobile]);

  return mobile;
}

/** Undo, redo and leaving a selection. Never takes keys from a text field or the tester. */
function useGlobalKeys() {
  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable;
      const store = useConfigurator.getState();
      if (typing || store.ui.testerOpen) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
      }
      if (event.key === 'Escape') store.clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** The opening: real load progress, then one choreographed reveal. */
function useIntro({ ready, rootRef, loaderRef, onDone }) {
  const played = useRef(false);
  useEffect(() => {
    if (!ready || played.current) return undefined;
    played.current = true;
    const done = () => {
      onDone();
      runtime.intro = 'done';
    };
    runtime.intro = 'playing';
    const elements = rootRef.current?.querySelectorAll('[data-reveal]') ?? [];

    if (SKIP_INTRO) {
      runtime.camera?.goTo('hero', { duration: 0 });
      done();
      return undefined;
    }

    const layout = getLayout(useConfigurator.getState().build.layoutId);
    runtime.camera?.intro();
    dropKeycaps(layout, { height: 30, spread: 0.55 });
    const backdrop = getBackdrop(useSettings.getState().backdrop);
    runtime.wallMark?.play(backdrop.wallOpacity * 3.6);

    const tl = gsap.timeline({ onComplete: done });
    tl.to(loaderRef.current, { autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, 0);
    tl.fromTo(
      '.intro-tagline',
      { autoAlpha: 0, y: 10 },
      { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out' },
      0.5,
    );
    tl.to('.intro-tagline', { autoAlpha: 0, duration: 0.6, ease: 'power2.in' }, 2.0);
    const directions = { left: { x: -36 }, right: { x: 36 }, top: { y: -18 }, bottom: { y: 24 } };
    elements.forEach((element, i) => {
      const from = directions[element.dataset.reveal] ?? {};
      tl.fromTo(
        element,
        { autoAlpha: 0, ...from },
        { autoAlpha: 1, x: 0, y: 0, duration: 0.8, ease: 'power3.out', clearProps: 'transform,opacity,visibility' },
        1.05 + i * 0.09,
      );
    });
    return () => tl.kill();
  }, [ready, rootRef, loaderRef, onDone]);
}

export function App() {
  const route = useRoute();
  const mobile = usePanelMetrics(route);
  const cinematic = useConfigurator((s) => s.ui.cinematic);
  const studioOpen = useConfigurator((s) => s.ui.studioOpen);
  const leftOpen = useConfigurator((s) => s.ui.leftOpen);
  const rightOpen = useConfigurator((s) => s.ui.rightOpen);
  const setUi = useConfigurator((s) => s.setUi);
  const appearance = useSettings((s) => s.appearance);
  const backdrop = useSettings((s) => s.backdrop);

  const [fontsReady, setFontsReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [fatal, setFatal] = useState(null);
  const rootRef = useRef(null);
  const loaderRef = useRef(null);

  useAudioSync();
  useGlobalKeys();
  useAutoQuality();

  // Real progress: the legends and PCB art are drawn from this typeface, so it comes first.
  useEffect(() => {
    let live = true;
    Promise.all([
      document.fonts.load('560 64px "Hanken Grotesk Variable"'),
      document.fonts.load('800 64px "Hanken Grotesk Variable"'),
    ])
      .catch(() => {})
      .then(() => {
        if (live) setFontsReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2')) {
      setFatal('This browser or device does not support WebGL 2, which the 3D studio needs.');
    }
  }, []);

  useEffect(() => {
    if (!fontsReady) return;
    runtime.onFirstFrame = () => {
      // One more frame lets the first shadows and environment settle behind the loader.
      requestAnimationFrame(() => setSceneReady(true));
    };
  }, [fontsReady]);

  const onIntroDone = useMemo(() => () => setIntroDone(true), []);
  useIntro({ ready: sceneReady, rootRef, loaderRef, onDone: onIntroDone });

  useEffect(() => {
    const dark = appearance === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.studio = getBackdrop(backdrop).uiTone;
  }, [appearance, backdrop]);

  useEffect(() => {
    if (params.has('debug') || import.meta.env.DEV) {
      window.__build = { runtime, store: useConfigurator, settings: useSettings, keyboardAudio, renderThumbnail };
    }
  }, []);

  useEffect(() => {
    if (route === 'explore' || route === 'configure') touch('full');
    // Leaving a page closes floating tools from the previous one.
    if (route !== 'explore') setUi({ testerOpen: false });
    if (route === 'gallery' || route === 'about') window.scrollTo(0, 0);
    document.title = { configure: 'BUILD. Make it yours.', explore: 'Explore. BUILD', gallery: 'Gallery. BUILD', about: 'About. BUILD' }[route];
  }, [route, setUi]);

  const inStudio = route === 'configure' || route === 'explore';
  const progressSteps = (fontsReady ? 1 : 0) + (sceneReady ? 1 : 0);

  return (
    <div ref={rootRef} className="app" data-route={route} data-cinematic={cinematic || undefined} data-ready={introDone || undefined} data-testid="app">
      <a className="skip-link" href="#main-controls">
        Skip to the controls
      </a>

      {fontsReady && !fatal ? (
        <SceneBoundary>
          <KeyboardScene onUnsupported={setFatal} />
        </SceneBoundary>
      ) : null}

      {fatal ? (
        <div className="fatal" role="alert">
          <h1>The 3D studio can't run here</h1>
          <p>{fatal}</p>
        </div>
      ) : null}

      <Header />

      {inStudio && !cinematic ? (
        <div id="main-controls">
          {studioOpen ? null : route === 'configure' ? <Sidebar /> : <ExplorePanel />}
          {studioOpen ? <StudioPanel /> : <Inspector />}
          <KeyboardTester />
        </div>
      ) : null}

      {inStudio ? <Toolbar /> : null}

      {inStudio && mobile && !cinematic ? (
        <div className="mobile-bar" role="group" aria-label="Open panels">
          <button
            type="button"
            className="mobile-tab"
            aria-pressed={leftOpen}
            data-testid="mobile-customize"
            onClick={() => setUi({ leftOpen: !leftOpen, rightOpen: false, studioOpen: false })}
          >
            {route === 'configure' ? 'Customize' : 'Explore'}
          </button>
          <button
            type="button"
            className="mobile-tab"
            aria-pressed={rightOpen}
            data-testid="mobile-details"
            onClick={() => setUi({ rightOpen: !rightOpen, leftOpen: false, studioOpen: false })}
          >
            Details
          </button>
        </div>
      ) : null}

      {route === 'gallery' ? <Gallery /> : null}
      {route === 'about' ? <About /> : null}

      <SwitchInspector />
      <SpecSheet />
      <ExportSheet />
      <Toast />

      <p className="intro-tagline" aria-hidden="true">
        Make it yours.
      </p>

      <div ref={loaderRef} className="loader" data-hidden={introDone || undefined} data-testid="loader" role="status">
        <span className="loader-mark">BUILD</span>
        <span className="progress-track loader-track">
          <i style={{ transform: `scaleX(${(progressSteps + 1) / 3})` }} />
        </span>
        <span className="sr-only">Loading the studio</span>
      </div>

      {params.has('debug') ? <DebugHud /> : null}
    </div>
  );
}

/** Real figures from the renderer. Shown only with ?debug in the URL. */
function DebugHud() {
  const [text, setText] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      setText(
        `${(1000 / runtime.stats.frameMs).toFixed(0)} fps · ${runtime.view.samples}/${runtime.view.maxSamples} samples · ` +
          `${runtime.stats.calls ?? 0} calls · ${((runtime.stats.triangles ?? 0) / 1000).toFixed(0)}k tris`,
      );
    }, 300);
    return () => clearInterval(id);
  }, []);
  return <div className="debug-hud">{text}</div>;
}
