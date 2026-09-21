import { RasterScene } from '../types';
import { computeNdvi, computeNdwi, computeNdbi } from './indices';
import { computeCoverageEntries, generateSpectralMasks, COLOR_MAP } from './segmentation';
import { computeSemanticChange } from './change';

export interface CoverageTrendItem {
  className: string;
  color: string;
  scene1Pct: number;
  scene2Pct: number;
  deltaPct: number;
  relativePct: number;
  scene1Hectares: number;
  scene2Hectares: number;
  deltaHectares: number;
  direction: 'increase' | 'decrease' | 'stable';
  interpretation: string;
}

export interface TransitionClassItem {
  className: string;
  percentage: number;
  hectares: number;
  color: string;
  description: string;
}

export interface BiTemporalTrendSummary {
  scene1Name: string;
  scene2Name: string;
  items: CoverageTrendItem[];
  transitionClasses: TransitionClassItem[];
  spectralDeltas: {
    meanDeltaNdvi: number;
    meanDeltaNdwi: number;
    meanDeltaNdbi: number;
  };
  headline: string;
  analysisText: string;
}

/**
 * Calculates coverage percentages and deltas between two temporal scenes
 */
export function calculateCoverageTrend(
  scene1: RasterScene,
  scene2: RasterScene
): BiTemporalTrendSummary {
  // 1. Spectral Land Cover Masks for both scenes
  const masks1 = generateSpectralMasks(scene1);
  const masks2 = generateSpectralMasks(scene2);

  const cov1 = computeCoverageEntries(scene1, masks1);
  const cov2 = computeCoverageEntries(scene2, masks2);

  const cov1Map = new Map(cov1.map((c) => [c.class.toLowerCase(), c]));
  const cov2Map = new Map(cov2.map((c) => [c.class.toLowerCase(), c]));

  // Standard Land Cover classes to compare
  const classesToCompare = ['vegetation', 'water', 'built-up'];
  const items: CoverageTrendItem[] = [];

  for (const rawCls of classesToCompare) {
    const entry1 = cov1Map.get(rawCls);
    const entry2 = cov2Map.get(rawCls);

    const s1Pct = entry1 ? entry1.percentage : 0;
    const s2Pct = entry2 ? entry2.percentage : 0;
    const deltaPct = Math.round((s2Pct - s1Pct) * 10) / 10;

    const s1Ha = entry1 ? entry1.hectares : 0;
    const s2Ha = entry2 ? entry2.hectares : 0;
    const deltaHa = Math.round((s2Ha - s1Ha) * 100) / 100;

    let relPct = 0;
    if (s1Pct > 0) {
      relPct = Math.round(((s2Pct - s1Pct) / s1Pct) * 1000) / 10;
    } else if (s2Pct > 0) {
      relPct = 100;
    }

    let direction: 'increase' | 'decrease' | 'stable' = 'stable';
    if (deltaPct > 0.5) direction = 'increase';
    else if (deltaPct < -0.5) direction = 'decrease';

    const rgb = COLOR_MAP[rawCls] || [140, 140, 140];
    const color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

    let interpretation = '';
    if (rawCls === 'water') {
      if (deltaPct > 2) interpretation = 'Inundation expansion or reservoir filling';
      else if (deltaPct < -2) interpretation = 'Water body recession or reservoir depletion';
      else interpretation = 'Stable hydrological baseline';
    } else if (rawCls === 'vegetation') {
      if (deltaPct > 2) interpretation = 'Vegetative vigor emergence or seasonal greening';
      else if (deltaPct < -2) interpretation = 'Canopy loss, agricultural harvesting, or stress';
      else interpretation = 'Stable canopy cover';
    } else if (rawCls === 'built-up') {
      if (deltaPct > 1) interpretation = 'Impervious surface expansion or construction activity';
      else if (deltaPct < -1) interpretation = 'Reduced spectral signature or obstruction';
      else interpretation = 'Stable urban infrastructure';
    }

    items.push({
      className: rawCls.charAt(0).toUpperCase() + rawCls.slice(1),
      color,
      scene1Pct: s1Pct,
      scene2Pct: s2Pct,
      deltaPct,
      relativePct: relPct,
      scene1Hectares: s1Ha,
      scene2Hectares: s2Ha,
      deltaHectares: deltaHa,
      direction,
      interpretation,
    });
  }

  // 2. Mean Spectral index deltas
  const ndvi1 = computeNdvi(scene1.bands.B08, scene1.bands.B04);
  const ndvi2 = computeNdvi(scene2.bands.B08, scene2.bands.B04);
  const ndwi1 = computeNdwi(scene1.bands.B03, scene1.bands.B08);
  const ndwi2 = computeNdwi(scene2.bands.B03, scene2.bands.B08);
  const ndbi1 = computeNdbi(scene1.bands.B11, scene1.bands.B08);
  const ndbi2 = computeNdbi(scene2.bands.B11, scene2.bands.B08);

  const len = Math.min(ndvi1.length, ndvi2.length);
  let sumNdvi = 0;
  let sumNdwi = 0;
  let sumNdbi = 0;

  for (let i = 0; i < len; i++) {
    sumNdvi += ndvi2[i] - ndvi1[i];
    sumNdwi += ndwi2[i] - ndwi1[i];
    sumNdbi += ndbi2[i] - ndbi1[i];
  }

  const meanDeltaNdvi = Math.round((sumNdvi / len) * 1000) / 1000;
  const meanDeltaNdwi = Math.round((sumNdwi / len) * 1000) / 1000;
  const meanDeltaNdbi = Math.round((sumNdbi / len) * 1000) / 1000;

  // 3. Specific Bi-temporal Transition Classes
  const changeResult = computeSemanticChange(scene1, scene2);
  const changeCoverage = computeCoverageEntries(scene2, changeResult.masks);

  const transitionClasses: TransitionClassItem[] = changeCoverage
    .filter((c) => c.percentage > 0.1)
    .map((c) => {
      let desc = '';
      if (c.class.includes('flooding')) desc = 'New water inundation over prior dry land';
      else if (c.class.includes('deforestation')) desc = 'Canopy reduction / clearing detected';
      else if (c.class.includes('construction')) desc = 'New bare soil or built surface emergence';
      else if (c.class.includes('crop')) desc = 'Field-level phenological change';
      else desc = 'Identified transitional land dynamics';

      return {
        className: c.class.charAt(0).toUpperCase() + c.class.slice(1),
        percentage: c.percentage,
        hectares: c.hectares,
        color: c.color,
        description: desc,
      };
    });

  // 4. Formulate Headline and Analysis Narrative
  const maxDeltaItem = [...items].sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0];

  let headline = 'Stable Land Dynamics';
  if (transitionClasses.length > 0 && changeResult.dominant !== 'none') {
    const dom = changeResult.dominant.replace('_', ' ');
    headline = `Significant ${dom.charAt(0).toUpperCase() + dom.slice(1)} Trend Detected`;
  } else if (maxDeltaItem && Math.abs(maxDeltaItem.deltaPct) >= 1.5) {
    headline = `${maxDeltaItem.className} Shift (${maxDeltaItem.deltaPct > 0 ? '+' : ''}${maxDeltaItem.deltaPct}%)`;
  }

  const narrativeParts: string[] = [];
  items.forEach((it) => {
    const sign = it.deltaPct > 0 ? '+' : '';
    narrativeParts.push(
      `${it.className}: ${it.scene1Pct}% → ${it.scene2Pct}% (${sign}${it.deltaPct}%, ${sign}${it.deltaHectares} ha)`
    );
  });

  let analysisText = `Multi-temporal comparison between "${scene1.name || 'Scene 1'}" and "${scene2.name || 'Scene 2'}": ${narrativeParts.join('; ')}.`;
  if (transitionClasses.length > 0) {
    const transList = transitionClasses.map((t) => `${t.className} (${t.percentage}%, ${t.hectares} ha)`).join(', ');
    analysisText += ` Transitional event segments identified: ${transList}.`;
  }
  analysisText += ` Spectral index deltas: ΔNDVI = ${meanDeltaNdvi > 0 ? '+' : ''}${meanDeltaNdvi}, ΔNDWI = ${meanDeltaNdwi > 0 ? '+' : ''}${meanDeltaNdwi}, ΔNDBI = ${meanDeltaNdbi > 0 ? '+' : ''}${meanDeltaNdbi}.`;

  return {
    scene1Name: scene1.name || 'Scene 1 (T1)',
    scene2Name: scene2.name || 'Scene 2 (T2)',
    items,
    transitionClasses,
    spectralDeltas: {
      meanDeltaNdvi,
      meanDeltaNdwi,
      meanDeltaNdbi,
    },
    headline,
    analysisText,
  };
}
