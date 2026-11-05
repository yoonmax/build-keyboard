import { RULES } from '../compatibility/rules.js';
import { LAYOUTS } from '../layouts/index.js';

export function About() {
  return (
    <main className="page about" data-testid="about">
      <header className="page-head">
        <h1 className="page-title">About</h1>
      </header>
      <div className="about-grid">
        <p className="about-lead">
          BUILD is a studio for designing a mechanical keyboard. Choose a layout, a case and every part inside, then see it
          assembled, take it apart and hear how it might sound.
        </p>

        <section className="about-section">
          <h2>How it works</h2>
          <p>
            There are no 3D model files. Every part is generated in millimetres from the layout data, so changing the layout
            recuts the case, plate and PCB, and moves each switch, stabilizer and keycap to its position.
          </p>
          <p>
            A compatibility engine checks the build against {RULES.length} rules and explains any problem in words. Each
            problem offers parts that would fix it.
          </p>
          <p>
            The picture keeps refining while the camera is still. Shadows soften and edges clean up, and then the graphics card
            goes idle until something changes.
          </p>
        </section>

        <section className="about-section">
          <h2>What's real and what isn't</h2>
          <dl className="about-list">
            <div>
              <dt>Layouts</dt>
              <dd>
                {LAYOUTS.map((l) => `${l.name} (${l.keyCount})`).join(', ')}. All follow the ANSI standard, with common key
                sizes and stabilizer spacing.
              </dd>
            </div>
            <div>
              <dt>Switches</dt>
              <dd>
                Drift, Keel, Ridge, Knoll, Tick and Latch are invented, simulated switches. Their force and travel figures are
                representative, and they aren't measurements of any product.
              </dd>
            </div>
            <div>
              <dt>Prices</dt>
              <dd>
                All prices are illustrative catalog estimates, made up to show how costs add up. They aren't quotes from any
                retailer, and nothing here can be bought.
              </dd>
            </div>
            <div>
              <dt>Compatibility</dt>
              <dd>
                The rules reflect real constraints, such as pin counts and stabilizer coverage, but they apply to this demo's
                catalog. Check real parts against their makers' documents.
              </dd>
            </div>
            <div>
              <dt>Sound</dt>
              <dd>
                Every sound is synthesized in the browser from decaying tones and filtered noise. There are no recordings, so
                there's nothing to credit or license. It suggests how parts differ and isn't an acoustic simulation.
              </dd>
            </div>
            <div>
              <dt>Circuit board</dt>
              <dd>
                The PCB's rows and columns follow the layout, but the artwork illustrates routing. It isn't a working design.
              </dd>
            </div>
          </dl>
        </section>

        <section className="about-section">
          <h2>Your data</h2>
          <p>
            Builds are saved in this browser's local storage, and nothing is sent anywhere. There's no account. Clearing your
            browser data deletes saved builds, so export anything you want to keep.
          </p>
        </section>

        <section className="about-section">
          <h2>Typeface</h2>
          <p>
            Interface and keycap legends use Hanken Grotesk, under the SIL Open Font License.
          </p>
        </section>
      </div>
    </main>
  );
}
