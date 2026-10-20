// Geographic data for the map layer: station coordinates, platform axes of the 3D twins and
// schematic shape points between stations. Every value carries its provenance like the rest of the model.

import type { Provenance, Sourced } from '../types';
import type { LatLon } from './projection';

export interface GeoStation extends LatLon {
  src: Provenance;
}

const wiki = (lat: number, lon: number, article: string): GeoStation => ({
  lat, lon, src: { kind: 'published', ref: 'wiki-stations', note: `Infobox coordinates, en.wikipedia.org/wiki/${article}` },
});

/** Coordinates of every node on the two modelled lines */
export const STATION_GEO: Record<string, GeoStation> = {
  // T14, Fruängen → Mörby centrum
  fruangen: wiki(59.28583, 17.965, 'Fruängen_metro_station'),
  vastertorp: wiki(59.29111, 17.96667, 'Västertorp_metro_station'),
  hagerstensasen: wiki(59.29556, 17.97889, 'Hägerstensåsen_metro_station'),
  telefonplan: wiki(59.29806, 17.99694, 'Telefonplan_metro_station'),
  midsommarkransen: wiki(59.3017, 18.0111, 'Midsommarkransen_metro_station'),
  liljeholmen: wiki(59.31028, 18.0225, 'Liljeholmen_metro_station'),
  hornstull: wiki(59.31556, 18.03389, 'Hornstull_metro_station'),
  zinkensdamm: wiki(59.31778, 18.05, 'Zinkensdamm_metro_station'),
  mariatorget: wiki(59.31667, 18.06306, 'Mariatorget_metro_station'),
  slussen: wiki(59.31917, 18.07194, 'Slussen_metro_station'),
  'gamla-stan': wiki(59.32278, 18.0675, 'Gamla_stan_metro_station'),
  't-centralen': wiki(59.33167, 18.06083, 'T-Centralen_metro_station'),
  ostermalmstorg: wiki(59.33472, 18.07389, 'Östermalmstorg_metro_station'),
  stadion: wiki(59.34306, 18.08111, 'Stadion_metro_station'),
  'tekniska-hogskolan': wiki(59.34583, 18.07139, 'Tekniska_högskolan_metro_station'),
  universitetet: wiki(59.365, 18.05444, 'Universitetet_metro_station'),
  bergshamra: wiki(59.3814, 18.0364, 'Bergshamra_metro_station'),
  'danderyds-sjukhus': wiki(59.39167, 18.04139, 'Danderyds_sjukhus_metro_station'),
  'morby-centrum': wiki(59.39861, 18.03611, 'Mörby_centrum_metro_station'),

  // Commuter corridor, south boundary → north boundary
  'boundary-south': {
    lat: 59.31417, lon: 18.06444,
    src: { kind: 'derived', ref: 'wiki-stations', note: 'Virtual boundary node, drawn at Stockholms södra (en.wikipedia.org/wiki/Stockholm_Södra_station).' },
  },
  'stockholm-city': {
    lat: 59.3315, lon: 18.0575,
    src: {
      kind: 'assumption', ref: 'wiki-stations',
      note: 'Wikipedia gives no coordinates, only that the station lies directly below T-Centralen; placed under Vasagatan about 200 m west of the T-Centralen reference point.',
    },
  },
  'stockholm-odenplan': wiki(59.34278, 18.04889, 'Odenplan_station'),
  solna: wiki(59.36694, 18.00944, 'Solna_station'),
  ulriksdal: wiki(59.3844, 18.0139, 'Ulriksdal_railway_station'),
  'boundary-north': {
    lat: 59.4092, lon: 17.9622,
    src: { kind: 'derived', ref: 'wiki-stations', note: 'Virtual boundary node, drawn at Helenelund (en.wikipedia.org/wiki/Helenelund_railway_station).' },
  },
};

export interface PlatformAxis {
  /** Compass bearing of the platform, pointing towards increasing station order ("north" direction) */
  bearingDeg: Sourced<number>;
  /** Length of straight track kept on each side of the station centre so the 3D model sits on the line */
  straightHalfM: number;
}

/** Platform axes of the stations that have a full 3D twin */
export const PLATFORM_AXIS: Record<string, PlatformAxis> = {
  't-centralen': {
    bearingDeg: {
      value: 355,
      src: {
        kind: 'assumption', ref: 'assumption',
        note: 'Red/green line platforms run roughly north–south between Gamla stan and Hötorget; exact axis not sourced.',
      },
    },
    straightHalfM: 150,
  },
  solna: {
    bearingDeg: {
      value: 350,
      src: {
        kind: 'assumption', ref: 'assumption',
        note: 'Mainline through Solna runs NNW–SSE between Tomteboda and Ulriksdal; exact axis not sourced.',
      },
    },
    straightHalfM: 280,
  },
};

/** Extra shape points between consecutive stations ("fromId>toId"), so lines follow the real corridor roughly */
export const SHAPE_POINTS: Record<string, Sourced<LatLon[]>> = {
  'boundary-south>stockholm-city': {
    value: [{ lat: 59.3248, lon: 18.0632 }],
    src: { kind: 'assumption', ref: 'assumption', note: 'Schematic: Citybanan tunnel under Riddarholmen.' },
  },
  'stockholm-odenplan>solna': {
    value: [{ lat: 59.3517, lon: 18.0283 }],
    src: { kind: 'assumption', ref: 'assumption', note: 'Schematic: Citybanan north portal at Tomteboda, then the mainline to Solna.' },
  },
};
