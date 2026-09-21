import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  CheckSquare,
  Square,
  Sparkles,
  HelpCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { CoverageEntry, MasksMap, OperationalTemplate } from '../types';
import { COLOR_MAP } from '../satquery/segmentation';

export interface SemanticSegmentDetail {
  id: string;
  label: string;
  rgb: [number, number, number];
  hex: string;
  spectralRule: string;
  bands: string;
  description: string;
  operationalMeaning: string;
  templates: OperationalTemplate[];
}

export const SEMANTIC_SEGMENTS: Record<string, SemanticSegmentDetail> = {
  flooding: {
    id: 'flooding',
    label: 'Flooding Inundation',
    rgb: COLOR_MAP.flooding || [0, 140, 255],
    hex: '#008cff',
    spectralRule: 'NDWI > 0.05 && ΔNDWI > +0.12 && NDVI_t2 < NDVI_t1',
    bands: 'Sentinel-2 B03 (Green 560nm) vs B08 (NIR 842nm)',
    description:
      'Newly inundated surface area or expansion of water bodies between acquisitions.',
    operationalMeaning:
      'Identifies flood water extent, submerged infrastructure, emergency hazard zones, and displacement boundaries.',
    templates: ['disaster', 'change', 'auto'],
  },
  water: {
    id: 'water',
    label: 'Open Water / Reservoirs',
    rgb: COLOR_MAP.water || [30, 90, 220],
    hex: '#1e5adc',
    spectralRule: 'NDWI = (B03 - B08) / (B03 + B08) > 0.05',
    bands: 'Sentinel-2 B03 (Green) vs B08 (NIR)',
    description:
      'Permanent surface water absorption in NIR and SWIR with green-blue reflectance.',
    operationalMeaning:
      'Delineates baseline river channels, lakes, impoundments, and marine shorelines before hazard events.',
    templates: ['landcover', 'disaster', 'auto'],
  },
  vegetation: {
    id: 'vegetation',
    label: 'Healthy Canopy / Vegetation',
    rgb: COLOR_MAP.vegetation || [40, 170, 70],
    hex: '#28aa46',
    spectralRule: 'NDVI = (B08 - B04) / (B08 + B04) > 0.30',
    bands: 'Sentinel-2 B08 (NIR) vs B04 (Red 665nm)',
    description:
      'High chlorophyll leaf cell reflectance in the NIR plateau and strong absorption in Red.',
    operationalMeaning:
      'Maps continuous forest canopy, active agricultural crops, tree cover, and riparian vegetation buffers.',
    templates: ['landcover', 'disaster', 'auto'],
  },
  'built-up': {
    id: 'built-up',
    label: 'Built-Up / Impervious Surface',
    rgb: COLOR_MAP['built-up'] || [210, 80, 50],
    hex: '#d25032',
    spectralRule: 'NDBI = (B11 - B08) / (B11 + B08) > 0.05',
    bands: 'Sentinel-2 B11 (SWIR 1610nm) vs B08 (NIR 842nm)',
    description:
      'Impermeable structures, asphalt, concrete, and commercial roofing with higher SWIR than NIR.',
    operationalMeaning:
      'Identifies human settlements, transportation grids, commercial buildings, and industrial zones at risk.',
    templates: ['landcover', 'disaster', 'auto'],
  },
  deforestation: {
    id: 'deforestation',
    label: 'Deforestation & Clearing',
    rgb: COLOR_MAP.deforestation || [180, 40, 20],
    hex: '#b42814',
    spectralRule: 'ΔNDVI < -0.15 && NDVI_t1 > 0.25 && NDWI_t2 < 0.10',
    bands: 'Sentinel-2 B08 (NIR), B04 (Red), B11 (SWIR)',
    description:
      'Sudden loss of photosynthetic biomass transitioning from mature forest to bare ground or slash.',
    operationalMeaning:
      'Flags timber harvesting, illegal logging incursions, clear-cutting, fire scars, and forest habitat loss.',
    templates: ['change', 'auto'],
  },
  construction: {
    id: 'construction',
    label: 'New Construction & Graded Soil',
    rgb: COLOR_MAP.construction || [240, 180, 40],
    hex: '#f0b428',
    spectralRule: 'ΔNDBI > +0.12 && ΔNDVI < -0.05 && NDWI_t2 < 0.10',
    bands: 'Sentinel-2 B11 (SWIR) vs B08 (NIR)',
    description:
      'Undeveloped or vegetated land converted into graded bare earth, foundation concrete, or roofing.',
    operationalMeaning:
      'Tracks urban expansion, civil infrastructure projects, building developments, and zoning compliance.',
    templates: ['change', 'auto'],
  },
  crop_evolution: {
    id: 'crop_evolution',
    label: 'Crop Phenology / Field Cycle',
    rgb: COLOR_MAP.crop_evolution || [180, 220, 60],
    hex: '#b4dc3c',
    spectralRule: '|ΔNDVI| > 0.12 && NDVI_t1 > 0.15 && NDVI_t2 > 0.05',
    bands: 'Sentinel-2 B08 (NIR) vs B04 (Red)',
    description:
      'Cyclical vegetation changes characteristic of agricultural sowing, canopy development, or harvesting.',
    operationalMeaning:
      'Distinguishes seasonal farming rotations from permanent land use change or deforestation.',
    templates: ['change', 'agriculture', 'auto'],
  },
  vegetation_loss: {
    id: 'vegetation_loss',
    label: 'Vegetation Stress / Biomass Loss',
    rgb: COLOR_MAP.vegetation_loss || [220, 50, 40],
    hex: '#dc3228',
    spectralRule: 'ΔNDVI < -0.10 across bi-temporal acquisition pair',
    bands: 'Sentinel-2 B08 (NIR) vs B04 (Red)',
    description:
      'Reduction in canopy chlorophyll absorption and cellular vigor over the monitoring interval.',
    operationalMeaning:
      'Detects agricultural drought stress, disease or pest infestation, crop lodging, and early senescing.',
    templates: ['agriculture', 'auto'],
  },
  vegetation_gain: {
    id: 'vegetation_gain',
    label: 'Vegetation Growth / Vigor Gain',
    rgb: COLOR_MAP.vegetation_gain || [50, 200, 80],
    hex: '#32c850',
    spectralRule: 'ΔNDVI > +0.10 across bi-temporal acquisition pair',
    bands: 'Sentinel-2 B08 (NIR) vs B04 (Red)',
    description:
      'Increase in green biomass density and cellular leaf water index between acquisition dates.',
    operationalMeaning:
      'Tracks seedling emergence, post-precipitation greening, crop ripening, and reforestation growth.',
    templates: ['agriculture', 'auto'],
  },
};

const TEMPLATE_META: Record<
  OperationalTemplate,
  {
    title: string;
    subtitle: string;
    primaryClasses: string[];
    badgeColor: string;
  }
> = {
  disaster: {
    title: 'Flood & Disaster Response Legend',
    subtitle:
      'Focusing on inundation expansion, baseline water bodies, and vulnerable infrastructure assets.',
    primaryClasses: ['flooding', 'water', 'built-up', 'vegetation'],
    badgeColor: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  },
  agriculture: {
    title: 'Agricultural Health & Phenology Legend',
    subtitle:
      'Tracking bi-temporal NDVI vigor anomalies, moisture/drought stress, and field crop rotation.',
    primaryClasses: ['vegetation_loss', 'vegetation_gain', 'crop_evolution', 'vegetation'],
    badgeColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  change: {
    title: 'Bi-Temporal Land Dynamics Legend',
    subtitle:
      'Classifying multi-spectral shifts: clear-cutting, civil construction, inundation, and field cycles.',
    primaryClasses: ['flooding', 'deforestation', 'construction', 'crop_evolution'],
    badgeColor: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  },
  landcover: {
    title: 'Land Cover Classification Legend',
    subtitle:
      'Single-date spectral partitioning separating open water, photosynthetic canopy, and built surfaces.',
    primaryClasses: ['water', 'vegetation', 'built-up'],
    badgeColor: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  },
  auto: {
    title: 'Multi-Modal Autonomous Legend',
    subtitle:
      'Heuristic routing across multispectral indices, morphological segmentation, and SAR fusion.',
    primaryClasses: [
      'water',
      'vegetation',
      'built-up',
      'flooding',
      'deforestation',
      'construction',
      'crop_evolution',
    ],
    badgeColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
};

interface SemanticLegendProps {
  template: OperationalTemplate;
  masks?: MasksMap;
  activeClasses: Set<string>;
  onToggleClass: (className: string) => void;
  coverage?: CoverageEntry[];
  defaultCollapsed?: boolean;
}

export const SemanticLegend: React.FC<SemanticLegendProps> = ({
  template,
  masks = {},
  activeClasses,
  onToggleClass,
  coverage = [],
  defaultCollapsed = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [detailedClassId, setDetailedClassId] = useState<string | null>(null);

  const meta = TEMPLATE_META[template] || TEMPLATE_META.auto;

  // Build a map of coverage metrics for fast lookup
  const coverageMap = useMemo(() => {
    const map = new Map<string, CoverageEntry>();
    for (const c of coverage) {
      map.set(c.class, c);
    }
    return map;
  }, [coverage]);

  // Determine which semantic classes to present in the legend:
  // 1. All classes relevant to the current OperationalTemplate
  // 2. Any classes that actually exist in the current masks (so none are hidden)
  const displayedSegments = useMemo(() => {
    const currentMaskKeys = Object.keys(masks);
    const set = new Set<string>();

    // First add template's primary classes
    meta.primaryClasses.forEach((k) => set.add(k));

    // Next add any class that has mask data in the current result
    currentMaskKeys.forEach((k) => set.add(k));

    const result: SemanticSegmentDetail[] = [];
    for (const key of set) {
      if (SEMANTIC_SEGMENTS[key]) {
        result.push(SEMANTIC_SEGMENTS[key]);
      } else {
        // Fallback for unknown class if any
        const fallbackColor = COLOR_MAP[key] || [160, 160, 160];
        result.push({
          id: key,
          label: key.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          rgb: fallbackColor,
          hex: `rgb(${fallbackColor.join(',')})`,
          spectralRule: 'Derived remote-sensing mask',
          bands: 'Sentinel-2 multispectral bands',
          description: `Detected region for class ${key}`,
          operationalMeaning: 'Classified spatial feature.',
          templates: [template],
        });
      }
    }

    // Sort: detected first, then by priority
    return result.sort((a, b) => {
      const aHasMask = !!masks[a.id];
      const bHasMask = !!masks[b.id];
      if (aHasMask && !bHasMask) return -1;
      if (!aHasMask && bHasMask) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [template, masks, meta]);

  const allVisible = useMemo(() => {
    return displayedSegments.every((s) => activeClasses.has(s.id));
  }, [displayedSegments, activeClasses]);

  const handleToggleAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allVisible) {
      displayedSegments.forEach((s) => {
        if (activeClasses.has(s.id)) {
          onToggleClass(s.id);
        }
      });
    } else {
      displayedSegments.forEach((s) => {
        if (!activeClasses.has(s.id)) {
          onToggleClass(s.id);
        }
      });
    }
  };

  const detectedCount = displayedSegments.filter((s) => !!masks[s.id]).length;

  return (
    <div
      id="semantic-legend-container"
      className="mt-4 border border-slate-800/90 rounded-xl bg-slate-950/70 overflow-hidden shadow-sm transition-all"
    >
      {/* Collapsible Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-3 bg-slate-900/90 hover:bg-slate-900 transition-colors flex items-center justify-between cursor-pointer select-none border-b border-slate-800/60"
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsCollapsed(!isCollapsed);
          }
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700/60 text-emerald-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-wide">
                {meta.title}
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${meta.badgeColor}`}
              >
                {template.toUpperCase()}
              </span>
              {detectedCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {detectedCount} detected in scene
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block mt-0.5">
              {meta.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Swatches Preview when Collapsed */}
          {isCollapsed && (
            <div className="flex items-center gap-1 mr-1">
              {displayedSegments.slice(0, 6).map((s) => (
                <span
                  key={s.id}
                  className="w-2.5 h-2.5 rounded-full ring-1 ring-slate-900"
                  style={{ backgroundColor: s.hex }}
                  title={`${s.label} (${s.hex})`}
                />
              ))}
              {displayedSegments.length > 6 && (
                <span className="text-[10px] text-slate-500 font-mono">
                  +{displayedSegments.length - 6}
                </span>
              )}
            </div>
          )}

          {/* Show / Hide All quick toggle */}
          <button
            type="button"
            onClick={handleToggleAll}
            className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-800 border border-slate-700/70 rounded-md transition flex items-center gap-1 cursor-pointer"
            title={allVisible ? 'Hide all semantic layers' : 'Show all semantic layers'}
          >
            {allVisible ? (
              <>
                <EyeOff className="w-3 h-3 text-slate-400" />
                <span className="hidden xs:inline">Hide All</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 text-emerald-400" />
                <span className="hidden xs:inline">Show All</span>
              </>
            )}
          </button>

          {/* Collapse Chevron */}
          <div className="p-1 rounded text-slate-400 hover:text-slate-200">
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4 transition-transform" />
            ) : (
              <ChevronUp className="w-4 h-4 transition-transform" />
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-4 space-y-3">
          {/* Legend Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {displayedSegments.map((segment) => {
              const isActive = activeClasses.has(segment.id);
              const mask = masks[segment.id];
              const isDetected = !!mask;
              const cov = coverageMap.get(segment.id);
              const isExpandedDetail = detailedClassId === segment.id;

              return (
                <div
                  key={segment.id}
                  id={`legend-item-${segment.id}`}
                  className={`rounded-lg border p-2.5 transition-all text-xs flex flex-col justify-between ${
                    isActive
                      ? 'bg-slate-900/90 border-slate-700/90 shadow-xs'
                      : 'bg-slate-950/40 border-slate-800/60 opacity-60'
                  }`}
                >
                  <div>
                    {/* Top row: Checkbox, Swatch, Title, and Detection Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                        onClick={() => onToggleClass(segment.id)}
                      >
                        <button
                          type="button"
                          className="text-slate-400 hover:text-emerald-400 shrink-0 cursor-pointer"
                          aria-label={`Toggle ${segment.label} mask visibility`}
                        >
                          {isActive ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>

                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border border-white/20"
                          style={{ backgroundColor: segment.hex }}
                        />

                        <div className="truncate font-semibold text-slate-200">
                          {segment.label}
                        </div>
                      </div>

                      {/* Detection status pill */}
                      {isDetected ? (
                        <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {cov ? `${cov.percentage}%` : 'Detected'}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-500 border border-slate-700/50">
                          0%
                        </span>
                      )}
                    </div>

                    {/* Spectral Formula snippet */}
                    <div className="mt-1.5 pl-6 font-mono text-[10px] text-slate-400 truncate">
                      {segment.spectralRule}
                    </div>

                    {/* Area metrics if present */}
                    {cov && (
                      <div className="mt-1 pl-6 flex items-center gap-2 text-[10px] text-slate-300 font-mono">
                        <span className="text-emerald-300 font-semibold">{cov.hectares} ha</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{cov.squareMeters.toLocaleString()} m²</span>
                      </div>
                    )}
                  </div>

                  {/* Expandable Explanation Details */}
                  <div className="mt-2 pt-2 border-t border-slate-800/80 pl-1">
                    <button
                      type="button"
                      onClick={() =>
                        setDetailedClassId(isExpandedDetail ? null : segment.id)
                      }
                      className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-medium transition cursor-pointer"
                    >
                      <Info className="w-3 h-3 text-slate-500" />
                      <span>{isExpandedDetail ? 'Hide details' : 'Physics & Interpretation'}</span>
                    </button>

                    {isExpandedDetail && (
                      <div className="mt-1.5 p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1 animate-in fade-in duration-150">
                        <p className="text-slate-300 leading-snug">
                          {segment.description}
                        </p>
                        <div className="text-slate-400 pt-1 text-[10px] leading-tight">
                          <strong className="text-slate-300">Operational Application:</strong>{' '}
                          {segment.operationalMeaning}
                        </div>
                        <div className="text-slate-500 font-mono text-[9px] pt-0.5">
                          Bands: {segment.bands}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Operational Guidance Callout footer */}
          <div className="pt-2 border-t border-slate-800/70 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-slate-400 gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Color swatches mirror the high-contrast overlays rendered directly on the satellite viewport.
              </span>
            </div>
            <span className="font-mono text-slate-500 text-[10px]">
              Assumed 10m Sentinel-2 GSD (1 pixel = 100 m²)
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
