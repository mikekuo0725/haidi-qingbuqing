// What the Taiwan map draws, as plain data: one dot per spot, or one dot per named dive site when zoomed in.
import { K } from './constants.js';

export function spotPins(spots, summaries, dayIndex) {
  return spots.map((s) => {
    const d = summaries[s.id]?.[dayIndex] ?? null;
    return {
      id: s.id,
      lat: s.center[0],
      lon: s.center[1],
      light: d ? d.light : 'gray',
      label: d ? `${s.name} ${Math.round(d.meters)}m` : s.name,
      flowToDeg: d ? d.flowToDeg : null,
    };
  });
}

// A site takes the light of the zone it is in, for the chosen day.
export function sitePins(siteLayers, summaries, dayIndex) {
  return Object.entries(siteLayers).flatMap(([spotId, layer]) => layer.sites.map((site) => ({
    spotId,
    zoneId: site.zoneId,
    name: site.name,
    lat: site.location[0],
    lon: site.location[1],
    light: summaries[spotId]?.[dayIndex]?.zoneLights?.[site.zoneId] ?? 'gray',
  })));
}

export const layerFor = (zoom) => ({
  spots: zoom < K.mapSiteZoom,
  sites: zoom >= K.mapSiteZoom,
  labels: zoom >= K.mapLabelZoom,
});
