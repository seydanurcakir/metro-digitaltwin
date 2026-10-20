# Stockholm Metro Twin

**Live demo: [metro-digitaltwin.netlify.app](https://metro-digitaltwin.netlify.app)**

A simulation-driven digital twin of Stockholm's red metro line T14 (Fruängen – Mörby centrum) and the commuter rail corridor to Solna, shown on a geographic map. The primary KPI is **platform dispersion time**: the time within which 90% of passengers arriving on a platform have boarded a train and left.

```bash
npm install
npm test        # data model + simulation + app + optimiser + network + map tests
npm run dev     # open the 3D map in the browser
npm run build   # single-file page in dist/
```

## Step 8: Map, two station twins and live trains

The isolated 3D scene is now a navigable map of the network.

- **Geographic map.** Everything is placed in one metric frame centred on T-Centralen (Web Mercator scaled by cos 59.33°, so distances are true to ~0.1%). Pan, zoom from a single platform out to the whole network, rotate and tilt. There is no external map service: the lines, stations and trains are drawn from the twin's own data on a dark ground with a faint 500 m / 2.5 km grid.
- **Station coordinates** come from each station's Wikipedia article and carry provenance like every other value (`src/geo/geodata.ts`). Stockholm City has no published coordinates and is marked as an assumption.
- **Two full 3D twins.** T-Centralen (underground: back wall, mezzanines, tunnels) and **Solna** (surface: island platform under a glass canopy, footbridges with gates, escalators, overhead line). Both have the same functions: live crowd and heat map, detailed trains with doors and roof load bars, clickable platform halves, escalators and station signs. The camera flies between them, and moving the map close to a twin makes it the focus of the dashboard.
- **Live trains on the map.** Every simulated T14 and commuter train moves along its line in real time. A shared kinematics module (`src/geo/motion.ts`, trapezoidal speed profile between timetable stops) drives both the map trains and the trains inside the twins, so a train leaves a station model and continues on the map without a jump. Click any train to inspect it, or **follow** it with the camera.
- **Network tab.** A live schematic of the T-Centralen ⇄ Solna corridor with every commuter train, the expected journey time right now (walk + wait + ride), and a list to track any train.
- **English throughout**: UI, metrics, data notes and source titles, test output and this README.

| File | Contents |
|---|---|
| `src/geo/projection.ts` | Local metric projection, bearings |
| `src/geo/geodata.ts` | Station coordinates, platform axes of the twins, schematic shape points |
| `src/geo/alignment.ts` | Line polylines with arc length; straight sections through the twins |
| `src/geo/motion.ts` | Train position at any time t from the simulated timetable |
| `app/twin/world.ts` | Lines, the two twins (layout, position, orientation), map stations, camera presets |
| `app/scene/MapGround.tsx` | Dark map ground with a metric grid |
| `app/scene/NetworkLines.tsx`, `NetworkTrains.tsx`, `StationLabels.tsx` | Lines, live trains and station labels on the map |
| `scripts/test-geo.ts` | Projection vs. great-circle distances, alignments, train kinematics |

## Step 7: Network layer and Solna station (`src/network/`)

Solna station is a **commuter rail** (pendeltåg) station; it is not on the metro. The real connection is T-Centralen → (walk, ~5 min) → Stockholm City → Stockholm Odenplan → Solna (7 min, J40/J41/42X).

| File | Contents |
|---|---|
| `src/data/corridor-solna.ts` | Commuter corridor: City, Odenplan, **Solna**, Ulriksdal + two virtual boundary nodes; X60 fleet; timetable; Citybanan constraints; transfer parameters |
| `src/network/network.ts` | Network graph: nodes (stations), track edges (time, capacity, signalling), transfer edge; shortest route |
| `src/network/integration.ts` | T14 ↔ corridor integration: some passengers alighting at T-Centralen walk to the Stockholm City platforms |
| `src/network/station-agent.ts` | `StationAgent`: state at any time (`stateAt`), minute stream (`stream`), 15-minute KPI series (`timeSeries`) |
| `scripts/solna.ts` | `npm run solna` → `data/solna-timeseries.json` and `.csv` |
| `scripts/test-network.ts` | Network, integration and Solna tests |

**T-Centralen ↔ Solna link parameters**

| Edge | Time | Capacity | Signalling |
|---|---|---|---|
| T-Centralen → Stockholm City (transfer) | 300 s (assumption) | 8,000 pax/h (assumption) | — |
| Stockholm City → Odenplan (Citybanan) | 150 s | 16 commuter trains/h/direction (published) | ATC-2, min headway 150 s |
| Odenplan → Solna | 225 s | 20 trains/h (derived) | ATC-2, 180 s (assumption) |

City → Solna takes 7 min in total (Solna stad).

**No double counting:** Stockholm City's published boardings already include transfers. The transfer flow from T14 is subtracted from City's walk-in demand, so the total is kept and only the timing of transfer waves comes from the T14 simulation.

**Scope:** core transport operations only. Attractions around Solna (mall, stadium) and event crowds are not modelled at this stage.

## Deployment (Netlify, free)

`netlify.toml` holds the settings: build command `npm run build`, publish folder `dist`, Node 20.

1. [app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project** → **GitHub**
2. Choose the `metro-digitaltwin` repository; the settings come from the file → **Deploy**
3. Rename the site under **Project configuration → Change project name**

Every push to the repository rebuilds the site.

## Step 6: Optimisation (`src/opt/optimize.ts`)

Chooses a headway (4 / 5 / 6 / 7.5 / 10 min) and train length (2 / 3 units) for every 15-minute slot.

- **Objective:** minimise passenger-weighted dispersion time.
- **Budget:** total unit-trips ≤ the current timetable (no extra operating cost).
- **Constraints:** shared trunk (T13 + T14 ≤ 24 trains/h), fleet (54 units), min and max headway, train load ≤ 90%, platform density ≤ 2.0 people/m².
- **Method:** multiple-choice knapsack solved exactly by dynamic programming, then validated by simulation: in a slot over a limit, and in the two slots before it, the capacity margin is raised and the problem solved again. Trains reach the centre ~20 minutes after leaving the terminal, so action starts early.

```bash
npm run optimize   # regenerates src/data/optimized-plans.json
```

| | Current | Recommended |
|---|---|---|
| Normal day, evening dispersion time at T-Centralen | 9:00 | 3:30 |
| Evening crowd (21:00, +3,000), T-Centralen | 29:45 | 4:45 |
| Evening crowd, peak platform density | 2.73 | 1.70 people/m² |
| Operation (unit-trips / day) | 1,104 | 1,044 – 1,050 |

Results rest on synthetic demand; rerun the optimisation with real gate data.

## Step 5: Metrics, comparison, inspection

- **KPI strip (top):** for the focused station, the current 15 minutes' dispersion time, average wait, platform density, train load and trains running; each with its difference to the reference plan.
- **Compare plans tab:** time window (this 15 min, morning peak, midday, evening peak, evening, whole day) and scope (T-Centralen / whole line) filters; a table of 6 metrics; dispersion time over the day; the service in the current slot.
- Every number is computed from the simulation via `app/twin/metrics.ts`; no number is typed by hand.
- Other plans and scenarios are pre-computed in idle time after the page opens.
- `scripts/test-app.ts`: consistency of what the scene and panels read with the simulation, and per-frame cost (60 FPS budget).

## Step 4: Click to inspect

| Clicked | Panel |
|---|---|
| Train (in a twin or on the map) | Train code, direction, length/capacity, where it is now, next stop, load, load along the line, stops; follow on map |
| Half of a platform | People waiting, density vs. limit, last 30 minutes, next 3 trains and their load, passengers who will not fit |
| Escalator | Flow down to and up from the platform (people/min) |
| Station sign or map station | Live platform state, next trains, station data with the source of every value |

The selection lives in Zustand (`selection`); calculations are pure functions in `app/twin/inspect.ts`. A drag is not a click; clicking empty map clears the selection.

## Step 3: 3D scene (`app/`)

React + React Three Fiber + Zustand. No game engine; it runs in the browser.

| Folder | Role |
|---|---|
| `app/twin/model.ts` | Builds the dataset, runs the simulation once per plan × scenario and caches it |
| `app/twin/layout.ts` | Station dimensions from the data: platform length/area, track axes, escalators |
| `app/twin/selectors.ts` | Pure functions: people on the platform at t, trains inside a twin, next train |
| `app/twin/store.ts` | Time, playback, speed, plan, scenario, focus, selection, camera commands (Zustand) |
| `app/scene/` | Drawing only: map, lines, trains, stations, crowd + heat map. No business logic |
| `app/hud/` | Clock, controls, live readouts, legend, panels |

Rule: scene components never compute numbers; they read from `selectors.ts`.

## Step 2: Simulation engine (`src/sim/`)

An event-based, mesoscopic model. A whole day simulates in about 0.1 s.

1. **Timetable:** departures from both terminals are generated from the service plan. Trains advance with running and dwell times. The first trips start early so trains are already spread along the line at 05:00.
2. **Platform:** passengers arrive in 30-second groups and queue by direction (FIFO).
3. **When a train arrives:** passengers for this station get off, then the queue boards until the train is full. Each boarding passenger's destination follows the demand model.
4. **Records:** waiting time for every boarding, platform occupancy and train load at every stop.

`simulate(dataset, plan, { demandMultiplier, surges, boardingLimitFactor })`: `surges` add a sudden crowd at a station and time (e.g. after a match).

### Metrics (`computeKpis`)

| Metric | Definition |
|---|---|
| Dispersion time P90 (primary KPI) | Time within which 90% of arriving passengers have boarded and left the platform |
| Average wait | Average time per passenger on the platform |
| Peak load factor | Train load on departure / capacity (limit 90%) |
| Platform density | People/m² just before a train arrives (limit 2.0) |
| Left behind | Passengers who could not board and wait for the next train (person-times) |

Metrics can be taken per time window and per station. `slotSeries` gives 15-minute series and `platformTrace` a station's platform occupancy trace, both for charts.

## Data files

| File | Contents |
|---|---|
| `src/types.ts` | All types: line, station, platform, train, demand, service plan, constraints, metrics |
| `src/data/sources.ts` | Source list |
| `src/data/line-t14.ts` | 19 stations, 18 sections, daily boardings, platforms, shared trunk |
| `src/data/fleet.ts` | C20 unit (414 passengers), short/long trains, fleet |
| `src/data/time.ts` | 80 slots of 15 minutes from 05:00 to 01:00, time-of-day demand profile |
| `src/data/demand.ts` | Demand per slot × station × direction and destination distribution |
| `src/data/plans.ts` | Current timetable, trial plan, T13 traffic, constraints |

## Every number has a source

Every value is stored as `{ value, src }`. `src.kind` is one of:

- `published`: from an official publication (SL annual report, Wikipedia)
- `derived`: computed from published values
- `assumption`: an assumption, to be replaced with real data
- `synthetic`: generated by the model

## How demand is generated

1. **Daily boardings (published):** SL 2022 report. At interchange stations, the 2019 red line value × 0.72 (2022/2019 metro total ratio).
2. **T14 share:** equal split with T13 on the shared trunk (Liljeholmen–Östermalmstorg), 50%.
3. **Time of day (synthetic):** a curve peaking at 08:00 and 16:45.
4. **Direction and destination (gravity model):** a passenger travels to each station with probability proportional to its boardings, with a morning/evening directional bias.

## Main assumptions to replace

- Running times between stations → Trafiklab GTFS timetable
- Track geometry between stations → GTFS shapes or OpenStreetMap (now straight lines plus a few schematic points)
- Platform areas and the platform axes of the twins → station drawings
- Time-of-day demand → gate data
- Fleet allocated to T14, unit counts
