# SampleMind

SampleMind is an RVCE DBMS lab project for biological specimen custody, assays, storage, experiments and incident tracking.

On Windows, run `Start-SampleMind.cmd` from this folder and open [SampleMind](http://127.0.0.1:8000) after the server starts. The launcher uses Python 3.12 and Node.js 20 or newer. First-time setup installs dependencies and trains the synthetic-data experiment. The Windows launcher listens on loopback. Its login page lists the demo accounts.

SQLite holds specimen and workflow records. TinyDB keeps the custody projection and temperature evidence in `.runtime/evidence.json`. Keep both files to preserve your data. Starting the app again preserves existing SQLite records. A fresh checkout seeds a small illustrative inventory automatically.

**Cohort Review** opens after sign-in. With the demo reference S003, select **Try an excluded specimen** and check one or more assay assumptions to compare the recorded and hypothetical decisions. Open a specimen or assay from its evidence to inspect the source row. The review applies why-not provenance to a fixed cohort query over existing SQLite tables.

Open **Database Lab** for SQL and query plans or to explore TinyDB documents. **More tools → Risk and ML Demo** includes an optional Random Forest exercise. Its bundled CSV and generator are synthetic, so the holdout metrics describe agreement with the simulator.
