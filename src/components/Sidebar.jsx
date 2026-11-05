import { useMemo, useState } from 'react';
import {
  ACCESSORIES,
  CASES,
  CASE_COLORS,
  CATALOG,
  FINISHES,
  KEYCAP_MATERIALS,
  KEYCAP_PROFILES,
  KEYCAP_SETS,
  KEYCAP_THEMES,
  KEY_GROUPS,
  LIGHTING,
  MOUNTS,
  PCBS,
  PLATES,
  STABILIZERS,
  SWITCHES,
  SWITCH_DATA_NOTE,
  SWITCH_TYPES,
  priceFor,
} from '../catalog/index.js';
import { evaluateOption } from '../compatibility/CompatibilityEngine.js';
import { LAYOUTS, getLayout } from '../layouts/index.js';
import { caseHex, caseColorName } from '../model/build.js';
import { colorwayName } from '../export/ConfigurationExporter.js';
import { formatPrice } from '../model/pricing.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { useSettings } from '../state/settingsStore.js';
import { ForceCurve } from './ForceCurve.jsx';
import { KeyPlan } from './KeyPlan.jsx';
import { ColorField, Option, OptionGroup, Slider, Swatch, Toggle } from './primitives.jsx';

/** Previews what picking an option would do, for guided filtering. */
function useOptionStatus(category, id) {
  const build = useConfigurator((s) => s.build);
  return useMemo(() => {
    const result = evaluateOption(build, category, id);
    return { status: result.status, text: result.issues[0]?.message };
  }, [build, category, id]);
}

function CatalogOption({ category, item, selected, price, detail, note, children }) {
  const choose = useConfigurator((s) => s.choose);
  const { status, text } = useOptionStatus(category, item.id);
  return (
    <Option
      name={item.name}
      price={price}
      detail={detail}
      note={note}
      selected={selected}
      status={selected ? 'ok' : status}
      statusText={text}
      testId={`option-${item.id}`}
      onClick={() => choose(category, item.id)}
    >
      {children}
    </Option>
  );
}

function LayoutPanel() {
  const build = useConfigurator((s) => s.build);
  const choose = useConfigurator((s) => s.choose);
  return (
    <OptionGroup label="All layouts use the ANSI standard.">
      {LAYOUTS.map((layout) => {
        const preview = evaluateOption(build, 'layout', layout.id);
        return (
          <Option
            key={layout.id}
            name={layout.name}
            price={`${layout.keyCount} keys`}
            note={layout.blurb}
            selected={build.layoutId === layout.id}
            status={build.layoutId === layout.id ? 'ok' : preview.status}
            statusText={preview.issues[0]?.message}
            testId={`layout-${layout.id}`}
            onClick={() => choose('layout', layout.id)}
          >
            <KeyPlan layout={layout} />
          </Option>
        );
      })}
    </OptionGroup>
  );
}

function CasePanel() {
  const build = useConfigurator((s) => s.build);
  const choose = useConfigurator((s) => s.choose);
  const setCaseColor = useConfigurator((s) => s.setCaseColor);
  const current = CATALOG.case.get(build.case.id);
  return (
    <>
      <OptionGroup label="Material">
        {CASES.map((item) => {
          const price = priceFor(item, build.layoutId);
          return (
            <CatalogOption
              key={item.id}
              category="case"
              item={item}
              selected={build.case.id === item.id}
              price={price === undefined || price === null ? 'Not sold' : formatPrice(price)}
              note={build.case.id === item.id ? item.notes : null}
            />
          );
        })}
      </OptionGroup>
      <section className="option-group">
        <h3 className="group-label">Colour</h3>
        <div className="swatch-row">
          {CASE_COLORS.filter((c) => c.id !== 'custom').map((color) => (
            <Swatch
              key={color.id}
              hex={color.hex}
              name={color.name}
              selected={build.case.colorId === color.id}
              testId={`case-color-${color.id}`}
              onClick={() => setCaseColor(color.id)}
            />
          ))}
          <Swatch
            hex={build.case.customColor}
            name="Custom"
            selected={build.case.colorId === 'custom'}
            testId="case-color-custom"
            onClick={() => setCaseColor('custom')}
          />
        </div>
        {build.case.colorId === 'custom' ? (
          <ColorField
            label="Custom colour"
            value={build.case.customColor}
            testId="case-custom-color"
            onChange={(hex) => setCaseColor('custom', hex)}
          />
        ) : null}
      </section>
      <OptionGroup label="Finish">
        {current.finishes.map((id) => (
          <Option
            key={id}
            name={FINISHES[id].name}
            note={build.case.finish === id ? FINISHES[id].note : null}
            selected={build.case.finish === id}
            testId={`finish-${id}`}
            onClick={() => choose('finish', id)}
          />
        ))}
      </OptionGroup>
      <OptionGroup label="Mount">
        {current.mounts.map((id) => {
          const preview = evaluateOption(build, 'mount', id);
          return (
            <Option
              key={id}
              name={MOUNTS[id].name}
              note={MOUNTS[id].note}
              selected={build.case.mount === id}
              status={build.case.mount === id ? 'ok' : preview.status}
              statusText={preview.issues[0]?.message}
              testId={`mount-${id}`}
              onClick={() => choose('mount', id)}
            />
          );
        })}
      </OptionGroup>
    </>
  );
}

function KeycapPanel() {
  const build = useConfigurator((s) => s.build);
  const selection = useConfigurator((s) => s.ui.selection);
  const applyKeycapTheme = useConfigurator((s) => s.applyKeycapTheme);
  const setKeycapColor = useConfigurator((s) => s.setKeycapColor);
  const setLegendPlacement = useConfigurator((s) => s.setLegendPlacement);
  const choose = useConfigurator((s) => s.choose);
  const customThemes = useSettings((s) => s.customThemes);
  const addCustomTheme = useSettings((s) => s.addCustomTheme);
  const removeCustomTheme = useSettings((s) => s.removeCustomTheme);
  const showToast = useConfigurator((s) => s.showToast);
  const { keycaps } = build;
  const set = CATALOG.keycaps.get(keycaps.setId);

  const saveTheme = () => {
    const name = `My theme ${customThemes.length + 1}`;
    addCustomTheme({
      id: `custom-${Date.now().toString(36)}`,
      name,
      note: 'Saved from the keycap editor.',
      base: keycaps.base,
      accent: keycaps.accent,
      highlight: keycaps.highlight,
      legend: keycaps.legend,
      legendHighlight: keycaps.legendHighlight,
      space: keycaps.space,
    });
    showToast(`Saved "${name}".`);
  };

  return (
    <>
      <section className="option-group">
        <h3 className="group-label">Theme</h3>
        <div className="theme-grid">
          {[...KEYCAP_THEMES, ...customThemes].map((theme) => (
            <button
              key={theme.id}
              type="button"
              className="theme"
              data-testid={`theme-${theme.id}`}
              aria-pressed={keycaps.themeId === theme.id}
              data-selected={keycaps.themeId === theme.id || undefined}
              onClick={() => applyKeycapTheme(theme.id, customThemes)}
            >
              <span className="theme-chips" aria-hidden="true">
                <i style={{ background: theme.base, color: theme.legend }}>A</i>
                <i style={{ background: theme.accent, color: theme.legend }}>A</i>
                <i style={{ background: theme.highlight, color: theme.legendHighlight }}>A</i>
              </span>
              <span className="theme-name">{theme.name}</span>
            </button>
          ))}
        </div>
        {keycaps.themeId !== 'custom' ? (
          <p className="group-hint">{[...KEYCAP_THEMES, ...customThemes].find((t) => t.id === keycaps.themeId)?.note}</p>
        ) : null}
      </section>

      <section className="option-group">
        <h3 className="group-label">Colours</h3>
        <ColorField label="Base" value={keycaps.base} testId="keycap-base" onChange={(v) => setKeycapColor('base', v)} />
        <ColorField label="Accent" value={keycaps.accent} testId="keycap-accent" onChange={(v) => setKeycapColor('accent', v)} />
        <ColorField
          label="Highlight"
          value={keycaps.highlight}
          testId="keycap-highlight"
          onChange={(v) => setKeycapColor('highlight', v)}
        />
        <ColorField
          label="Legend"
          value={keycaps.legend}
          against={keycaps.base}
          testId="keycap-legend"
          onChange={(v) => setKeycapColor('legend', v)}
        />
        <div className="button-row">
          {keycaps.themeId === 'custom' ? (
            <button type="button" className="text-button" data-testid="save-theme" onClick={saveTheme}>
              Save as theme
            </button>
          ) : null}
          {keycaps.themeId.startsWith('custom-') ? (
            <button type="button" className="text-button" onClick={() => removeCustomTheme(keycaps.themeId)}>
              Delete theme
            </button>
          ) : null}
        </div>
      </section>

      <KeyEditor selection={selection} />

      <OptionGroup label="Legends">
        {[
          ['corner', 'Top left'],
          ['center', 'Centred'],
          ['blank', 'Blank'],
        ].map(([id, name]) => (
          <Option
            key={id}
            name={name}
            selected={keycaps.legendPlacement === id}
            testId={`legend-${id}`}
            onClick={() => setLegendPlacement(id)}
          />
        ))}
      </OptionGroup>

      <OptionGroup label="Set and profile">
        {KEYCAP_SETS.map((item) => (
          <CatalogOption
            key={item.id}
            category="keycaps"
            item={item}
            selected={keycaps.setId === item.id}
            price={formatPrice(item.price)}
            note={keycaps.setId === item.id ? KEYCAP_PROFILES[item.profile].note : null}
          />
        ))}
      </OptionGroup>

      <OptionGroup label="Material">
        {set.materials.map((id) => {
          const material = KEYCAP_MATERIALS[id];
          return (
            <Option
              key={id}
              name={material.name}
              note={keycaps.material === id ? material.note : null}
              price={material.surcharge ? `+${formatPrice(material.surcharge)} per key` : null}
              selected={keycaps.material === id}
              testId={`cap-material-${id}`}
              onClick={() => choose('keycapMaterial', id)}
            />
          );
        })}
      </OptionGroup>
    </>
  );
}

/** Per-key and group editing. Works from the 3D view or from the plan below. */
function KeyEditor({ selection }) {
  const build = useConfigurator((s) => s.build);
  const selectKey = useConfigurator((s) => s.selectKey);
  const selectKeys = useConfigurator((s) => s.selectKeys);
  const clearSelection = useConfigurator((s) => s.clearSelection);
  const editKeys = useConfigurator((s) => s.editKeys);
  const resetKeys = useConfigurator((s) => s.resetKeys);
  const layout = getLayout(build.layoutId);
  const keyIds = useMemo(() => (selection.kind === 'keys' ? selection.keyIds : []), [selection]);
  const first = keyIds[0] ? layout.keyById.get(keyIds[0]) : null;
  const edit = first ? build.keycaps.overrides[first.id] : null;
  const firstColor = edit?.color ?? (first ? build.keycaps.base : '#FFFFFF');

  return (
    <section className="option-group">
      <h3 className="group-label">Key editor</h3>
      <p className="group-hint">Click a key here or on the keyboard. Shift-click to add more.</p>
      <KeyPlan
        layout={layout}
        keycaps={build.keycaps}
        selected={keyIds}
        onSelect={(id, additive) => selectKey(id, additive)}
        interactive
        testId="key-plan-editor"
      />
      <div className="chip-row" role="group" aria-label="Select a group of keys">
        {KEY_GROUPS.map((group) => {
          const ids = layout.keys.filter(group.match).map((k) => k.id);
          if (!ids.length) return null;
          return (
            <button
              key={group.id}
              type="button"
              className="chip"
              data-testid={`group-${group.id}`}
              onClick={() => selectKeys(ids)}
            >
              {group.name}
            </button>
          );
        })}
      </div>
      {keyIds.length ? (
        <div className="key-edit" data-testid="key-edit">
          <p className="key-edit-title" aria-live="polite">
            {keyIds.length === 1 ? (first?.legend || 'Spacebar') : `${keyIds.length} keys`} selected
          </p>
          <ColorField
            label="Key colour"
            value={firstColor}
            testId="key-color"
            onChange={(color) => editKeys(keyIds, { color })}
          />
          <ColorField
            label="Legend colour"
            value={edit?.legendColor ?? build.keycaps.legend}
            testId="key-legend-color"
            onChange={(legendColor) => editKeys(keyIds, { legendColor })}
          />
          <div className="chip-row" role="group" aria-label="Key material">
            {Object.values(KEYCAP_MATERIALS).map((material) => (
              <button
                key={material.id}
                type="button"
                className="chip"
                data-testid={`key-material-${material.id}`}
                aria-pressed={edit?.material === material.id}
                onClick={() => editKeys(keyIds, { material: material.id })}
              >
                {material.name}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button type="button" className="text-button" data-testid="key-reset" onClick={() => resetKeys(keyIds)}>
              Reset to theme
            </button>
            <button type="button" className="text-button" onClick={clearSelection}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SwitchPanel() {
  const build = useConfigurator((s) => s.build);
  const setUi = useConfigurator((s) => s.setUi);
  const [compareId, setCompareId] = useState('');
  const layout = getLayout(build.layoutId);
  const current = CATALOG.switch.get(build.switchId);
  const compare = SWITCHES.find((s) => s.id === compareId) ?? null;
  return (
    <>
      <p className="panel-note">{SWITCH_DATA_NOTE}</p>
      {SWITCH_TYPES.map((type) => (
        <OptionGroup key={type.id} label={type.name} hint={type.note}>
          {SWITCHES.filter((s) => s.type === type.id).map((item) => (
            <CatalogOption
              key={item.id}
              category="switch"
              item={item}
              selected={build.switchId === item.id}
              price={formatPrice(item.price * layout.switchCount)}
              detail={`${item.actuationForce} gf, ${item.totalTravel} mm travel, ${item.pins}-pin`}
              note={build.switchId === item.id ? item.notes : null}
            />
          ))}
        </OptionGroup>
      ))}
      <section className="option-group">
        <h3 className="group-label">Force curve</h3>
        <ForceCurve sw={current} compare={compare} marker={false} compact />
        <label className="field">
          <span>Compare with</span>
          <select value={compareId} onChange={(e) => setCompareId(e.target.value)} data-testid="compare-switch">
            <option value="">None</option>
            {SWITCHES.filter((s) => s.id !== current.id).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}, {s.typeName.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="wide-button"
          data-testid="open-macro"
          onClick={() => setUi({ switchMacroId: build.switchId })}
        >
          Inspect {current.name} up close
        </button>
      </section>
    </>
  );
}

function PlatePanel() {
  const build = useConfigurator((s) => s.build);
  return (
    <>
      <OptionGroup label="Plate">
        {PLATES.map((item) => (
          <CatalogOption
            key={item.id}
            category="plate"
            item={item}
            selected={build.plateId === item.id}
            price={formatPrice(priceFor(item, build.layoutId) ?? 0)}
            detail={item.acoustic}
            note={build.plateId === item.id ? item.notes : null}
          />
        ))}
      </OptionGroup>
      <OptionGroup label="PCB">
        {PCBS.map((item) => {
          const price = priceFor(item, build.layoutId);
          return (
            <CatalogOption
              key={item.id}
              category="pcb"
              item={item}
              selected={build.pcbId === item.id}
              price={price ? formatPrice(price) : 'Not sold'}
              detail={item.specs.Pins}
              note={build.pcbId === item.id ? item.notes : null}
            />
          );
        })}
      </OptionGroup>
    </>
  );
}

function StabilizerPanel() {
  const build = useConfigurator((s) => s.build);
  const layout = getLayout(build.layoutId);
  return (
    <OptionGroup
      label="Stabilizers"
      hint={`A ${layout.name} board needs ${layout.stabilizerCounts.small} small and ${layout.stabilizerCounts.large} large.`}
    >
      {STABILIZERS.map((item) => (
        <CatalogOption
          key={item.id}
          category="stabilizer"
          item={item}
          selected={build.stabilizerId === item.id}
          price={formatPrice(item.price)}
          detail={item.specs.Kit}
          note={build.stabilizerId === item.id ? item.notes : null}
        />
      ))}
    </OptionGroup>
  );
}

function LightingPanel() {
  const build = useConfigurator((s) => s.build);
  const setLighting = useConfigurator((s) => s.setLighting);
  const backdrop = useSettings((s) => s.backdrop);
  const set = useSettings((s) => s.set);
  return (
    <>
      <OptionGroup label="Lighting">
        {LIGHTING.map((item) => (
          <CatalogOption
            key={item.id}
            category="lighting"
            item={item}
            selected={build.lighting.mode === item.id}
            price={item.price ? formatPrice(item.price) : null}
            note={build.lighting.mode === item.id ? item.notes : null}
          />
        ))}
      </OptionGroup>
      {build.lighting.mode !== 'none' ? (
        <section className="option-group">
          <h3 className="group-label">Colour and level</h3>
          <ColorField
            label="LED colour"
            value={build.lighting.color}
            testId="light-color"
            onChange={(color) => setLighting({ color })}
          />
          <Slider
            label="Brightness"
            value={build.lighting.brightness}
            min={0.1}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            testId="light-brightness"
            onChange={(brightness) => setLighting({ brightness })}
          />
          {backdrop !== 'dark' ? (
            <button type="button" className="text-button" onClick={() => set({ backdrop: 'dark' })}>
              See it in the dark studio
            </button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function AccessoriesPanel() {
  const build = useConfigurator((s) => s.build);
  const choose = useConfigurator((s) => s.choose);
  return (
    <section className="option-group">
      <h3 className="group-label">Accessories</h3>
      <div className="option-list">
        {ACCESSORIES.map((item) => {
          const preview = evaluateOption(build, 'accessory', item.id);
          const on = build.accessories.includes(item.id);
          const price = priceFor(item, build.layoutId);
          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              className="option"
              data-selected={on || undefined}
              data-testid={`accessory-${item.id}`}
              onClick={() => choose('accessory', item.id)}
            >
              <span className="option-head">
                <span className="option-name">{item.name}</span>
                <span className="option-price">{price ? formatPrice(price) : 'Not sold'}</span>
              </span>
              <span className="option-note">{item.notes}</span>
              {!on && preview.status !== 'ok' ? (
                <span className="option-status" data-tone={preview.status}>
                  <span>{preview.issues[0]?.message}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const CATEGORIES = [
  {
    id: 'layout',
    name: 'Layout',
    panel: LayoutPanel,
    value: (b) => `${getLayout(b.layoutId).name}, ${getLayout(b.layoutId).keyCount} keys`,
  },
  {
    id: 'case',
    name: 'Case',
    panel: CasePanel,
    value: (b) => `${CATALOG.case.get(b.case.id).name}, ${caseColorName(b.case).toLowerCase()}`,
    swatch: (b) => caseHex(b.case),
  },
  {
    id: 'keycaps',
    name: 'Keycaps',
    panel: KeycapPanel,
    value: (b) => colorwayName(b.keycaps),
    swatch: (b) => b.keycaps.base,
  },
  {
    id: 'switches',
    name: 'Switches',
    panel: SwitchPanel,
    value: (b) => `${CATALOG.switch.get(b.switchId).name}, ${CATALOG.switch.get(b.switchId).typeName.toLowerCase()}`,
  },
  {
    id: 'plate',
    name: 'Plate and PCB',
    panel: PlatePanel,
    value: (b) => `${CATALOG.plate.get(b.plateId).name}, with a ${CATALOG.pcb.get(b.pcbId).socket === 'solder' ? 'solder' : 'hot-swap'} PCB`,
  },
  { id: 'stabilizers', name: 'Stabilizers', panel: StabilizerPanel, value: (b) => CATALOG.stabilizer.get(b.stabilizerId).name },
  { id: 'lighting', name: 'Lighting', panel: LightingPanel, value: (b) => CATALOG.lighting.get(b.lighting.mode).name },
  {
    id: 'accessories',
    name: 'Accessories',
    panel: AccessoriesPanel,
    value: (b) => (b.accessories.length ? `${b.accessories.length} added` : 'None'),
  },
];

/** Each category opens in place, so the left slab only ever shows one set of choices. */
export function Sidebar() {
  const build = useConfigurator((s) => s.build);
  const category = useConfigurator((s) => s.ui.category);
  const setUi = useConfigurator((s) => s.setUi);
  const open = useConfigurator((s) => s.ui.leftOpen);
  const issues = useConfigurator((s) => s.compatibility.issues);

  return (
    <aside className="slab sidebar" data-open={open || undefined} aria-label="Keyboard components" data-reveal="left">
      <nav className="category-list" aria-label="Component categories">
        {CATEGORIES.map((entry) => {
          const active = category === entry.id;
          const Panel = entry.panel;
          const flagged = issues.some((issue) => issue.components.includes(flaggedComponent(entry.id)));
          return (
            <div key={entry.id} className="category" data-active={active || undefined}>
              <button
                type="button"
                className="category-head"
                aria-expanded={active}
                aria-controls={`panel-${entry.id}`}
                data-testid={`category-${entry.id}`}
                onClick={() => setUi({ category: active ? null : entry.id })}
              >
                <span className="category-name">
                  {entry.name}
                  {flagged ? <span className="category-flag" aria-label="Has a compatibility issue" /> : null}
                </span>
                <span className="category-value">
                  {entry.swatch ? <i className="category-swatch" style={{ background: entry.swatch(build) }} /> : null}
                  {entry.value(build)}
                </span>
              </button>
              {active ? (
                <div className="category-panel" id={`panel-${entry.id}`}>
                  <Panel />
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function flaggedComponent(categoryId) {
  return {
    layout: 'layout',
    case: 'case',
    keycaps: 'keycaps',
    switches: 'switch',
    plate: 'plate',
    stabilizers: 'stabilizer',
    lighting: 'lighting',
    accessories: 'accessory',
  }[categoryId];
}
