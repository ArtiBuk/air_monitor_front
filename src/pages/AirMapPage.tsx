import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, ForecastChart, PageHeader, Panel } from "../components/ui";
import { useTheme } from "../hooks/useTheme";
import { ApiError, api } from "../lib/api";
import {
  formatDateTime,
  formatMetricName,
  formatNumber,
  formatSourceList,
  getMetricSeverity,
  getMetricSeverityLabel,
  getMetricSeverityRank,
  type MetricSeverity,
} from "../lib/format";
import type { AirMapMetricSnapshot, AirMapStationPoint, ForecastRecord, JsonObject, Observation } from "../types/api";

type MapMap = import("maplibre-gl").Map;
type MapPopup = import("maplibre-gl").Popup;
type GeoJsonFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, StationFeatureProperties>;

type AirDistrict = "talnakh" | "central" | "kayerkan" | "unknown";
type LayerKey = "stations" | "labels" | "cityMetrics" | "hotspots";

interface StationFeatureProperties {
  station_id: string;
  station_name: string;
  title: string;
  context: string;
  value: number;
  value_label: string;
  severity: MetricSeverity;
  severity_label: string;
  severity_rank: number;
  severity_color: string;
  district: AirDistrict;
  district_label: string;
  district_tone: string;
  observed_at_utc: string;
  unit: string;
  source: string;
}

interface DecoratedStationPoint extends AirMapStationPoint {
  title: string;
  context: string;
  severity: MetricSeverity;
  severityLabel: string;
  severityRank: number;
  severityColor: string;
  district: AirDistrict;
  districtLabel: string;
  districtTone: string;
}

const OPEN_FREE_MAP_STYLE_URL = import.meta.env.VITE_AIR_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER: [number, number] = [88.191, 69.349];
const STATION_SOURCE_ID = "air-map-stations";
const STATION_GLOW_LAYER_ID = "air-map-stations-glow";
const STATION_CIRCLE_LAYER_ID = "air-map-stations-circle";
const STATION_LABEL_LAYER_ID = "air-map-stations-label";
const STATION_SELECTED_LAYER_ID = "air-map-stations-selected";
const FORECAST_METRIC_ORDER = [
  "mycityair_aqi_mean",
  "plume_index",
  "plume_pm25",
  "plume_pm10",
  "plume_no2",
  "plume_o3",
  "plume_so2",
  "plume_co",
];

const CITY_OVERLAY_METRIC_ORDER = ["mycityair_aqi_mean", "index", "pm25", "pm10", "no2", "o3", "so2", "co"];

let mapCssPromise: Promise<void> | null = null;

async function queryOrNull<T>(loader: () => Promise<T>) {
  try {
    return await loader();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

function ensureMapCss() {
  if (!mapCssPromise) {
    mapCssPromise = import("maplibre-gl/dist/maplibre-gl.css").then(() => undefined);
  }

  return mapCssPromise;
}

function normalizeStationName(value: string) {
  const parts = value
    .split("]")
    .map((part) => part.replace(/\[/g, "").trim())
    .filter(Boolean);

  if (!parts.length) {
    return { title: value || "Точка наблюдения", context: "" };
  }

  return {
    title: parts[0],
    context: parts.slice(1).join(" · "),
  };
}

function inferDistrict(station: AirMapStationPoint, normalizedName: ReturnType<typeof normalizeStationName>): AirDistrict {
  const haystack = `${station.station_name} ${normalizedName.context} ${JSON.stringify(station.extra ?? {})}`.toLowerCase();

  if (haystack.includes("талнах") || haystack.includes("talnakh")) {
    return "talnakh";
  }

  if (haystack.includes("кайеркан") || haystack.includes("kayerkan")) {
    return "kayerkan";
  }

  if (haystack.includes("централь") || haystack.includes("norilsk") || haystack.includes("норильск")) {
    return "central";
  }

  if (station.lon >= 88.34) {
    return "talnakh";
  }

  if (station.lon <= 87.86) {
    return "kayerkan";
  }

  return "central";
}

function getDistrictMeta(district: AirDistrict) {
  const meta: Record<AirDistrict, { label: string; tone: string }> = {
    talnakh: { label: "Талнах", tone: "talnakh" },
    central: { label: "Центральный", tone: "central" },
    kayerkan: { label: "Кайеркан", tone: "kayerkan" },
    unknown: { label: "Район не определён", tone: "unknown" },
  };

  return meta[district];
}

function getSeverityColor(severity: MetricSeverity) {
  const colors: Record<MetricSeverity, string> = {
    normal: "#6ee7b7",
    elevated: "#fcd34d",
    critical: "#fb7185",
    unknown: "#cbd5e1",
  };

  return colors[severity];
}

function hasCoordinates(item: Observation): item is Observation & { lat: number; lon: number } {
  return item.lat !== null && item.lon !== null;
}

function toStationPoint(item: Observation & { lat: number; lon: number }): AirMapStationPoint {
  return {
    station_id: item.station_id,
    station_name: item.station_name,
    lat: item.lat,
    lon: item.lon,
    observed_at_utc: item.observed_at_utc,
    value: item.value,
    unit: item.unit,
    source: item.source,
    source_kind: item.source_kind,
    extra: item.extra,
  };
}

function toCityMetric(item: Observation): AirMapMetricSnapshot {
  return {
    metric: item.metric,
    value: item.value,
    unit: item.unit,
    observed_at_utc: item.observed_at_utc,
    source: item.source,
    station_name: item.station_name,
    extra: item.extra,
  };
}

function mapForecastMetricName(metric: string) {
  if (metric.startsWith("plume_")) {
    return metric.slice(6);
  }

  return metric;
}

function getTimelineKindLabel(kind: "history" | "forecast") {
  return kind === "forecast" ? "Прогноз" : "История";
}

function shiftTimestampHours(timestamp: string, hours: number) {
  const date = new Date(timestamp);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function endOfForecastWindow(timestamp: string, hoursForward: number) {
  return new Date(shiftTimestampHours(timestamp, hoursForward)).getTime();
}

function formatTimelineDayLabel(timestamp: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(timestamp));
}

function formatTimelineHourLabel(timestamp: string) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function toLocalDayKey(timestamp: string) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dedupeStationPoints(points: AirMapStationPoint[]) {
  const deduped = new Map<string, AirMapStationPoint>();
  for (const point of points) {
    deduped.set(point.station_id, point);
  }
  return [...deduped.values()];
}

function buildDerivedMetricSnapshot(metric: string, value: number, timestamp: string, unit: string, source: string): AirMapMetricSnapshot {
  return {
    metric,
    value,
    unit,
    observed_at_utc: timestamp,
    source,
    station_name: "Norilsk",
    extra: { derived: true } satisfies JsonObject,
  };
}

function buildSyntheticCityMetrics(metrics: Map<string, AirMapMetricSnapshot>, timestamp: string): Map<string, AirMapMetricSnapshot> {
  const pm25 = metrics.get("pm25")?.value;
  const pm10 = metrics.get("pm10")?.value;
  const no2 = metrics.get("no2")?.value;
  const o3 = metrics.get("o3")?.value;

  if (!metrics.has("index") && [pm25, pm10, no2, o3].every((value) => value !== null && value !== undefined && Number.isFinite(value))) {
    const index = 0.35 * Number(pm25) + 0.30 * Number(pm10) + 0.20 * Number(no2) + 0.15 * Number(o3);
    metrics.set("index", buildDerivedMetricSnapshot("plume_index", index, timestamp, "index", "derived"));
  }

  if (!metrics.has("so2") && [pm25, pm10, no2].every((value) => value !== null && value !== undefined && Number.isFinite(value))) {
    const so2 = 0.45 * Number(pm10) + 0.35 * Number(pm25) + 0.20 * Number(no2);
    metrics.set("so2", buildDerivedMetricSnapshot("plume_so2", so2, timestamp, "µg/m3", "derived"));
  }

  if (!metrics.has("co") && [pm25, no2].every((value) => value !== null && value !== undefined && Number.isFinite(value))) {
    const co = 0.60 * Number(no2) + 0.40 * Number(pm25);
    metrics.set("co", buildDerivedMetricSnapshot("plume_co", co, timestamp, "µg/m3", "derived"));
  }

  return metrics;
}

function toChartRecord(timestamp: string, metrics: AirMapMetricSnapshot[]): ForecastRecord {
  const values: Record<string, number> = {};
  for (const metric of metrics) {
    if (metric.value !== null && metric.value !== undefined && Number.isFinite(metric.value)) {
      const key = metric.metric === "mycityair_aqi_mean" ? metric.metric : metric.metric.startsWith("plume_") ? metric.metric : `plume_${metric.metric}`;
      values[key] = metric.value;
    }
  }

  return {
    id: timestamp,
    timestamp_utc: timestamp,
    values,
  };
}

function getLatestSummaryTimestamp(summary: { latest_station_timestamp: string | null; latest_city_timestamp: string | null } | undefined) {
  const timestamps = [summary?.latest_station_timestamp, summary?.latest_city_timestamp].filter(Boolean) as string[];
  return timestamps.sort((left, right) => new Date(left).getTime() - new Date(right).getTime()).at(-1) ?? "";
}

function normalizeCityMetricKey(metric: string) {
  return metric.startsWith("plume_") ? metric.slice(6) : metric;
}

function buildForecastCityMetrics(timestamp: string, values: Record<string, number>, unitByMetric: Map<string, string>): AirMapMetricSnapshot[] {
  return Object.entries(values)
    .filter(([metric]) => FORECAST_METRIC_ORDER.includes(metric))
    .sort(([left], [right]) => FORECAST_METRIC_ORDER.indexOf(left) - FORECAST_METRIC_ORDER.indexOf(right))
    .map(([metric, value]) => ({
      metric: mapForecastMetricName(metric),
      value,
      unit: unitByMetric.get(mapForecastMetricName(metric)) ?? (metric.includes("aqi") ? "index" : ""),
      observed_at_utc: timestamp,
      source: "forecast",
      station_name: "Norilsk",
      extra: { forecast_metric: metric } satisfies JsonObject,
    }));
}

function buildStationFeatureCollection(stations: DecoratedStationPoint[]): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [station.lon, station.lat],
      },
      properties: {
        station_id: station.station_id,
        station_name: station.station_name,
        title: station.title,
        context: station.context,
        value: station.value ?? Number.NaN,
        value_label: formatNumber(station.value, "—"),
        severity: station.severity,
        severity_label: station.severityLabel,
        severity_rank: station.severityRank,
        severity_color: station.severityColor,
        district: station.district,
        district_label: station.districtLabel,
        district_tone: station.districtTone,
        observed_at_utc: station.observed_at_utc,
        unit: station.unit,
        source: station.source,
      },
    })),
  };
}

function buildPopupContent(station: DecoratedStationPoint) {
  const container = document.createElement("article");
  container.className = `air-map-popup air-map-popup-${station.districtTone}`;
  container.innerHTML = `
    <div class="air-map-popup-head">
      <span class="air-map-popup-district">${station.districtLabel}</span>
    </div>
    <strong>${station.title}</strong>
    <p>${station.context || "НПР"}</p>
    <div class="air-map-popup-metrics">
      <div>
        <span>AQI</span>
        <strong>${formatNumber(station.value, "—")}</strong>
      </div>
      <div>
        <span>Статус</span>
        <strong>${station.severityLabel}</strong>
      </div>
    </div>
  `;

  return container;
}

function ensureStationLayers(map: MapMap) {
  if (!map.getSource(STATION_SOURCE_ID)) {
    map.addSource(STATION_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(STATION_GLOW_LAYER_ID)) {
    map.addLayer({
      id: STATION_GLOW_LAYER_ID,
      type: "circle",
      source: STATION_SOURCE_ID,
      paint: {
        "circle-color": ["get", "severity_color"],
        "circle-opacity": 0.16,
        "circle-radius": 20,
        "circle-blur": 0.9,
      },
    });
  }

  if (!map.getLayer(STATION_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: STATION_CIRCLE_LAYER_ID,
      type: "circle",
      source: STATION_SOURCE_ID,
      paint: {
        "circle-radius": 9,
        "circle-color": ["get", "severity_color"],
        "circle-stroke-width": 1.6,
        "circle-stroke-color": "#f8fafc",
      },
    });
  }

  if (!map.getLayer(STATION_SELECTED_LAYER_ID)) {
    map.addLayer({
      id: STATION_SELECTED_LAYER_ID,
      type: "circle",
      source: STATION_SOURCE_ID,
      paint: {
        "circle-radius": 14,
        "circle-color": "rgba(255,255,255,0)",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#f8fafc",
      },
      filter: ["==", ["get", "station_id"], ""],
    });
  }

  if (!map.getLayer(STATION_LABEL_LAYER_ID)) {
    map.addLayer({
      id: STATION_LABEL_LAYER_ID,
      type: "symbol",
      source: STATION_SOURCE_ID,
      layout: {
        "text-field": ["get", "value_label"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 10,
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#f8fafc",
        "text-halo-color": "rgba(15, 23, 42, 0.8)",
        "text-halo-width": 1.2,
      },
    });
  }
}

function getPadding() {
  return window.innerWidth >= 1280
    ? { top: 84, right: 96, bottom: 120, left: 84 }
    : { top: 48, right: 48, bottom: 96, left: 48 };
}

export function AirMapPage() {
  const { theme } = useTheme();
  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedTimestamp, setSelectedTimestamp] = useState("");
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    stations: true,
    labels: true,
    cityMetrics: true,
    hotspots: true,
  });
  const [mapReady, setMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapMap | null>(null);
  const popupRef = useRef<MapPopup | null>(null);

  const airMapQuery = useQuery({
    queryKey: ["air-map", "snapshot"],
    queryFn: () => api.getAirMap(),
  });
  const airMap = airMapQuery.data;
  const historyWindow = useMemo(() => {
    const latestTimestamp = getLatestSummaryTimestamp(airMap?.summary);
    if (!latestTimestamp) {
      return null;
    }

    return {
      start: shiftTimestampHours(latestTimestamp, -4 * 24),
      finish: latestTimestamp,
    };
  }, [airMap?.summary]);
  const stationHistoryQuery = useQuery({
    queryKey: ["air-map", "stations-history", historyWindow?.start, historyWindow?.finish],
    enabled: Boolean(historyWindow),
    queryFn: () =>
      api.listObservations({
        source: "mycityair",
        metric: "aqi",
        start: historyWindow?.start,
        finish: historyWindow?.finish,
        limit: 5000,
      }),
  });
  const cityHistoryQuery = useQuery({
    queryKey: ["air-map", "city-history", historyWindow?.start, historyWindow?.finish],
    enabled: Boolean(historyWindow),
    queryFn: () =>
      api.listObservations({
        source: "plumelabs",
        start: historyWindow?.start,
        finish: historyWindow?.finish,
        limit: 5000,
      }),
  });
  const latestForecastQuery = useQuery({ queryKey: ["air-map", "forecast"], queryFn: () => queryOrNull(() => api.getLatestForecast()) });

  const stationHistory = stationHistoryQuery.data ?? [];
  const cityHistory = cityHistoryQuery.data ?? [];
  const forecast = latestForecastQuery.data;

  const historicalStationSnapshots = useMemo(() => {
    const grouped = new Map<string, AirMapStationPoint[]>();
    for (const item of stationHistory) {
      if (item.metric !== "aqi" || !hasCoordinates(item)) {
        continue;
      }

      const timestamp = item.observed_at_utc;
      const bucket = grouped.get(timestamp) ?? [];
      bucket.push(toStationPoint(item));
      grouped.set(timestamp, bucket);
    }
    return grouped;
  }, [stationHistory]);

  const historicalCitySnapshots = useMemo(() => {
    const grouped = new Map<string, AirMapMetricSnapshot[]>();
    for (const item of cityHistory) {
      const timestamp = item.observed_at_utc;
      const bucket = grouped.get(timestamp) ?? [];
      bucket.push(toCityMetric(item));
      grouped.set(timestamp, bucket);
    }
    return grouped;
  }, [cityHistory]);

  const cityUnits = useMemo(() => {
    const units = new Map<string, string>();
    for (const item of cityHistory) {
      if (item.unit && !units.has(item.metric)) {
        units.set(item.metric, item.unit);
      }
    }
    return units;
  }, [cityHistory]);

  const forecastSnapshots = useMemo(() => {
    const grouped = new Map<string, AirMapMetricSnapshot[]>();
    for (const record of forecast?.records ?? []) {
      grouped.set(record.timestamp_utc, buildForecastCityMetrics(record.timestamp_utc, record.values, cityUnits));
    }
    return grouped;
  }, [cityUnits, forecast?.records]);

  const timelineEntries = useMemo(() => {
    const historyTimestamps = new Set<string>([...historicalStationSnapshots.keys(), ...historicalCitySnapshots.keys()]);
    const forecastTimestamps = new Set<string>(forecastSnapshots.keys());
    const entries = [
      ...Array.from(historyTimestamps).map((timestamp) => ({ timestamp, kind: "history" as const })),
      ...Array.from(forecastTimestamps).map((timestamp) => ({ timestamp, kind: "forecast" as const })),
    ].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

    return entries.map((entry) => ({
      ...entry,
      label: formatDateTime(entry.timestamp),
    }));
  }, [forecastSnapshots, historicalCitySnapshots, historicalStationSnapshots]);

  const latestHistoricalTimestamp = useMemo(() => {
    const timestamps = timelineEntries.filter((entry) => entry.kind === "history").map((entry) => entry.timestamp);
    return timestamps.at(-1) ?? "";
  }, [timelineEntries]);

  useEffect(() => {
    const hasSelectedTimestamp = timelineEntries.some((entry) => entry.timestamp === selectedTimestamp);
    if ((!selectedTimestamp || !hasSelectedTimestamp) && latestHistoricalTimestamp) {
      setSelectedTimestamp(latestHistoricalTimestamp);
    }
  }, [latestHistoricalTimestamp, selectedTimestamp, timelineEntries]);

  const timelineEntry = timelineEntries.find((entry) => entry.timestamp === selectedTimestamp) ?? null;
  const rawStationSnapshot = selectedTimestamp ? historicalStationSnapshots.get(selectedTimestamp) ?? [] : airMap?.station_points ?? [];
  const rawStationPoints = useMemo(() => dedupeStationPoints(rawStationSnapshot), [rawStationSnapshot]);
  const filledHistoricalCitySnapshots = useMemo(() => {
    const grouped = new Map<string, AirMapMetricSnapshot[]>();
    const timestamps = new Set<string>([...historicalCitySnapshots.keys(), ...historicalStationSnapshots.keys()]);

    for (const timestamp of timestamps) {
      const metricMap = new Map<string, AirMapMetricSnapshot>();
      for (const metric of historicalCitySnapshots.get(timestamp) ?? []) {
        metricMap.set(normalizeCityMetricKey(metric.metric), metric);
      }

      if (!metricMap.has("mycityair_aqi_mean")) {
        const stationPoints = dedupeStationPoints(historicalStationSnapshots.get(timestamp) ?? []);
        const values = stationPoints.map((point) => point.value).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
        if (values.length) {
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
          metricMap.set("mycityair_aqi_mean", buildDerivedMetricSnapshot("mycityair_aqi_mean", mean, timestamp, "index", "derived"));
        }
      }

      buildSyntheticCityMetrics(metricMap, timestamp);
      grouped.set(timestamp, [...metricMap.values()]);
    }

    return grouped;
  }, [historicalCitySnapshots, historicalStationSnapshots]);
  const selectedHistoricalCityMetrics = selectedTimestamp ? filledHistoricalCitySnapshots.get(selectedTimestamp) ?? [] : airMap?.city_metrics ?? [];
  const selectedForecastCityMetrics = selectedTimestamp ? forecastSnapshots.get(selectedTimestamp) ?? [] : [];
  const rawCityMetrics = selectedTimestamp
    ? [...selectedHistoricalCityMetrics, ...selectedForecastCityMetrics]
    : airMap?.city_metrics ?? [];

  const selectedBounds = useMemo(() => {
    const points = rawStationPoints.length ? rawStationPoints : airMap?.station_points ?? [];
    if (!points.length) {
      return airMap?.bounds ?? null;
    }

    const lats = points.map((point) => point.lat);
    const lons = points.map((point) => point.lon);
    return {
      min_lat: Math.min(...lats),
      max_lat: Math.max(...lats),
      min_lon: Math.min(...lons),
      max_lon: Math.max(...lons),
      center_lat: lats.reduce((sum, value) => sum + value, 0) / lats.length,
      center_lon: lons.reduce((sum, value) => sum + value, 0) / lons.length,
    };
  }, [airMap?.bounds, airMap?.station_points, rawStationPoints]);

  const decoratedStations = useMemo(
    () =>
      rawStationPoints.map((station) => {
        const normalizedName = normalizeStationName(station.station_name || station.station_id);
        const district = inferDistrict(station, normalizedName);
        const districtMeta = getDistrictMeta(district);
        const severity = getMetricSeverity("aqi", station.value);
        return {
          ...station,
          title: normalizedName.title,
          context: normalizedName.context,
          severity,
          severityLabel: getMetricSeverityLabel(severity),
          severityRank: getMetricSeverityRank(severity),
          severityColor: getSeverityColor(severity),
          district,
          districtLabel: districtMeta.label,
          districtTone: districtMeta.tone,
        } satisfies DecoratedStationPoint;
      }),
    [rawStationPoints],
  );

  const latestDecoratedStations = useMemo(
    () =>
      dedupeStationPoints(airMap?.station_points ?? []).map((station) => {
        const normalizedName = normalizeStationName(station.station_name || station.station_id);
        const district = inferDistrict(station, normalizedName);
        const districtMeta = getDistrictMeta(district);
        const severity = getMetricSeverity("aqi", station.value);
        return {
          ...station,
          title: normalizedName.title,
          context: normalizedName.context,
          severity,
          severityLabel: getMetricSeverityLabel(severity),
          severityRank: getMetricSeverityRank(severity),
          severityColor: getSeverityColor(severity),
          district,
          districtLabel: districtMeta.label,
          districtTone: districtMeta.tone,
        } satisfies DecoratedStationPoint;
      }),
    [airMap?.station_points],
  );

  const stationLayerPoints = decoratedStations.length ? decoratedStations : latestDecoratedStations;

  const hotspotStations = useMemo(() => {
    const uniqueStations = new Map<string, DecoratedStationPoint>();
    for (const station of stationLayerPoints) {
      uniqueStations.set(station.station_id, station);
    }

    return [...uniqueStations.values()].sort((left, right) => {
      if (left.severityRank !== right.severityRank) {
        return right.severityRank - left.severityRank;
      }
      return (right.value ?? 0) - (left.value ?? 0);
    });
  }, [stationLayerPoints]);

  const overlayCityMetrics = useMemo(() => {
    const deduped = new Map<string, AirMapMetricSnapshot>();

    for (const metric of rawCityMetrics) {
      deduped.set(normalizeCityMetricKey(metric.metric), metric);
    }

    return CITY_OVERLAY_METRIC_ORDER.map(
      (metricKey) =>
        deduped.get(metricKey) ?? {
          metric: metricKey,
          value: Number.NaN,
          unit: "",
          observed_at_utc: selectedTimestamp || latestHistoricalTimestamp || "",
          source: "",
          station_name: "Norilsk",
          extra: {} as JsonObject,
        },
    );
  }, [latestHistoricalTimestamp, rawCityMetrics, selectedTimestamp]);

  const stationFeatureCollection = useMemo(() => buildStationFeatureCollection(stationLayerPoints), [stationLayerPoints]);

  useEffect(() => {
    if (!hotspotStations.length) {
      return;
    }

    if (!selectedStationId || !hotspotStations.some((station) => station.station_id === selectedStationId)) {
      setSelectedStationId(hotspotStations[0].station_id);
    }
  }, [hotspotStations, selectedStationId]);

  const selectedStation = stationLayerPoints.find((item) => item.station_id === selectedStationId) ?? hotspotStations[0] ?? null;

  useEffect(() => {
    let isCancelled = false;
    let map: MapMap | null = null;

    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    void (async () => {
      await ensureMapCss();
      const maplibregl = (await import("maplibre-gl")).default;
      if (isCancelled || !mapContainerRef.current) {
        return;
      }

      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: OPEN_FREE_MAP_STYLE_URL,
        center: DEFAULT_CENTER,
        zoom: 8.7,
        attributionControl: false,
        cooperativeGestures: true,
      });

      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "168px",
        offset: 10,
        className: "air-map-popup-shell",
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      const clickHandler = (event: import("maplibre-gl").MapMouseEvent) => {
        const stationId = map
          ?.queryRenderedFeatures(event.point, { layers: [STATION_CIRCLE_LAYER_ID, STATION_LABEL_LAYER_ID] })?.[0]
          ?.properties?.station_id;
        if (stationId) {
          setSelectedStationId(stationId);
        }
      };

      const pointerHandler = () => {
        map?.getCanvas().style.setProperty("cursor", "pointer");
      };
      const pointerResetHandler = () => {
        map?.getCanvas().style.setProperty("cursor", "");
      };

      map.on("load", () => {
        ensureStationLayers(map as MapMap);
        mapRef.current = map as MapMap;
        setMapReady(true);
      });
      map.on("click", STATION_CIRCLE_LAYER_ID, clickHandler);
      map.on("click", STATION_LABEL_LAYER_ID, clickHandler);
      map.on("mouseenter", STATION_CIRCLE_LAYER_ID, pointerHandler);
      map.on("mouseenter", STATION_LABEL_LAYER_ID, pointerHandler);
      map.on("mouseleave", STATION_CIRCLE_LAYER_ID, pointerResetHandler);
      map.on("mouseleave", STATION_LABEL_LAYER_ID, pointerResetHandler);
    })();

    return () => {
      isCancelled = true;
      setMapReady(false);
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) {
      return;
    }

    ensureStationLayers(map);
    const source = map.getSource(STATION_SOURCE_ID) as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData(stationFeatureCollection);

    const stationVisibility = layers.stations && stationLayerPoints.length ? "visible" : "none";
    const labelVisibility = layers.stations && layers.labels && stationLayerPoints.length ? "visible" : "none";

    if (map.getLayer(STATION_GLOW_LAYER_ID)) {
      map.setLayoutProperty(STATION_GLOW_LAYER_ID, "visibility", stationVisibility);
    }
    if (map.getLayer(STATION_CIRCLE_LAYER_ID)) {
      map.setLayoutProperty(STATION_CIRCLE_LAYER_ID, "visibility", stationVisibility);
    }
    if (map.getLayer(STATION_SELECTED_LAYER_ID)) {
      map.setLayoutProperty(STATION_SELECTED_LAYER_ID, "visibility", stationVisibility);
      map.setFilter(STATION_SELECTED_LAYER_ID, ["==", ["get", "station_id"], selectedStationId || "__none__"]);
    }
    if (map.getLayer(STATION_LABEL_LAYER_ID)) {
      map.setLayoutProperty(STATION_LABEL_LAYER_ID, "visibility", labelVisibility);
    }
  }, [layers.labels, layers.stations, mapReady, selectedStationId, stationFeatureCollection, stationLayerPoints.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !selectedBounds || !stationLayerPoints.length) {
      return;
    }

    map.fitBounds(
      [
        [selectedBounds.min_lon, selectedBounds.min_lat],
        [selectedBounds.max_lon, selectedBounds.max_lat],
      ],
      {
        padding: getPadding(),
        duration: 900,
        maxZoom: stationLayerPoints.length === 1 ? 11.4 : 10.7,
      },
    );
  }, [mapReady, selectedBounds, selectedTimestamp, stationLayerPoints.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !selectedStation || !layers.stations) {
      popupRef.current?.remove();
      return;
    }

    popupRef.current?.setLngLat([selectedStation.lon, selectedStation.lat]).setDOMContent(buildPopupContent(selectedStation)).addTo(map);
  }, [layers.stations, mapReady, selectedStation, theme]);

  const toggleLayer = (key: LayerKey) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  };

  const sources = airMap?.summary.sources ?? [];
  const selectedTimestampLabel = selectedTimestamp ? formatDateTime(selectedTimestamp) : "-";
  const selectedTimestampHourLabel = selectedTimestamp ? formatTimelineHourLabel(selectedTimestamp) : "--:--";
  const isForecastTimestamp = timelineEntry?.kind === "forecast";
  const timelineForRender = useMemo(() => {
    if (!latestHistoricalTimestamp) {
      return timelineEntries;
    }

    const forecastEnd = endOfForecastWindow(latestHistoricalTimestamp, 24);
    return timelineEntries.filter((entry) => entry.kind === "history" || new Date(entry.timestamp).getTime() <= forecastEnd);
  }, [latestHistoricalTimestamp, timelineEntries]);
  const selectedTimelineIndex = Math.max(
    0,
    timelineForRender.findIndex((entry) => entry.timestamp === selectedTimestamp),
  );
  const selectedCityChartRecords = useMemo(() => {
    if (!selectedTimestamp) {
      return forecast?.records ?? [];
    }

    const selectedTime = new Date(selectedTimestamp).getTime();
    const selectedDayKey = toLocalDayKey(selectedTimestamp);

    if (timelineEntry?.kind === "forecast") {
      const dayForecastRecords = (forecast?.records ?? [])
        .filter((record) => toLocalDayKey(record.timestamp_utc) === selectedDayKey)
        .sort((left, right) => new Date(left.timestamp_utc).getTime() - new Date(right.timestamp_utc).getTime());
      const trimmed = dayForecastRecords.filter((record) => new Date(record.timestamp_utc).getTime() <= selectedTime);
      return trimmed.length >= 2 ? trimmed : dayForecastRecords;
    }

    const historicalRecords = [...filledHistoricalCitySnapshots.entries()]
      .filter(([timestamp]) => toLocalDayKey(timestamp) === selectedDayKey)
      .sort(([left], [right]) => new Date(left).getTime() - new Date(right).getTime())
      .map(([timestamp, metrics]) => toChartRecord(timestamp, metrics));
    const trimmed = historicalRecords.filter((record) => new Date(record.timestamp_utc).getTime() <= selectedTime);
    return trimmed.length >= 2 ? trimmed : historicalRecords;
  }, [filledHistoricalCitySnapshots, forecast?.records, selectedTimestamp, timelineEntry?.kind]);
  const timelineMarks = useMemo(
    () =>
      timelineForRender.flatMap((entry, index) => {
        const date = new Date(entry.timestamp);
        const isBoundary = index === 0 || index === timelineForRender.length - 1 || date.getHours() === 12;
        return isBoundary
          ? [
              {
                index,
                label: formatTimelineDayLabel(entry.timestamp),
              },
            ]
          : [];
      }),
    [timelineForRender],
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Пространственный слой"
        title="Карта воздуха НПР"
        description="OpenFreeMap-сцена по Норильскому промышленному району с историей, текущим состоянием и ближайшим прогнозным окном по городу."
        actions={
          <div className="button-row">
            <span className="pill">{`Постов: ${formatNumber(stationLayerPoints.length, "0")}`}</span>
            <span className="pill">{`Городских метрик: ${formatNumber(rawCityMetrics.length, "0")}`}</span>
            <span className="pill">{formatSourceList(sources, "Источники обновляются")}</span>
          </div>
        }
      />

      <Panel title="Картографический слой AQI" subtitle="Выбирай срез на шкале времени под картой: посты меняются по выбранному часу, а городской фон остаётся прямо на карте слева снизу.">
        {airMapQuery.isError ? (
          <EmptyState title="Не удалось загрузить snapshot карты" description="Проверь, что backend отдаёт `/api/monitoring/air-map` и пользователь авторизован." />
        ) : (
          <div className="air-map-layout">
            <div className="air-map-stage">
              <div ref={mapContainerRef} className="air-map-canvas" />

              <div className="air-map-control-panel">
                <div className="air-map-control-summary">
                  <span className="pill">{`Срез: ${selectedTimestampLabel}`}</span>
                  <span className="pill">{isForecastTimestamp ? "Прогноз" : "История"}</span>
                </div>
                <div className="air-map-control-switches">
                  {[
                    { key: "stations" as const, label: "Посты" },
                    { key: "labels" as const, label: "AQI" },
                    { key: "cityMetrics" as const, label: "Город" },
                    { key: "hotspots" as const, label: "Точки риска" },
                  ].map((item) => (
                    <label key={item.key} className={`air-map-toggle${layers[item.key] ? " air-map-toggle-active" : ""}`}>
                      <input type="checkbox" checked={layers[item.key]} onChange={() => toggleLayer(item.key)} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {layers.hotspots ? (
                <aside className="air-map-rail air-map-rail-floating">
                  <div className="air-map-rail-section">
                    <div className="air-map-section-head">
                      <div>
                        <span>Горячие точки</span>
                        <strong>{stationLayerPoints.length ? "Топ риска" : "Без station-level слоя"}</strong>
                      </div>
                      <small>{selectedTimestampLabel}</small>
                    </div>
                    {hotspotStations.length ? (
                      <div className="air-hotspot-list">
                        {hotspotStations.slice(0, 5).map((station, index) => (
                          <button
                            key={station.station_id}
                            type="button"
                            className="air-hotspot-row"
                            onClick={() => setSelectedStationId(station.station_id)}
                          >
                            <span>{`#${index + 1}`}</span>
                            <div>
                              <strong>{station.title}</strong>
                              <small>{station.districtLabel}</small>
                            </div>
                            <div>
                              <strong>{formatNumber(station.value)}</strong>
                              <small>{station.severityLabel}</small>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="air-map-rail-empty">
                        <EmptyState
                          title="На этом срезе нет station-level точек"
                          description={isForecastTimestamp ? "Для будущих отметок пока доступен только городской прогнозный фон." : "Нужны наблюдения MyCityAir на выбранный момент."}
                        />
                      </div>
                    )}
                  </div>
                </aside>
              ) : null}

              {layers.cityMetrics && overlayCityMetrics.length ? (
                <div className="air-map-city-overlay air-map-city-overlay-floating">
                  <div className="air-map-city-overlay-head">
                    <div>
                      <span>{isForecastTimestamp ? "Городской прогноз" : "Городской фон"}</span>
                      <small>{selectedTimestampLabel}</small>
                    </div>
                  </div>
                  <div className="air-map-city-overlay-grid">
                    {overlayCityMetrics.map((metric) => {
                      const severity = getMetricSeverity(metric.metric, metric.value);
                      return (
                        <div key={`${metric.metric}-${metric.observed_at_utc}`} className={`air-map-city-pill air-map-city-pill-${severity}`}>
                          <span>{formatMetricName(metric.metric, metric.metric)}</span>
                          <strong>{formatNumber(metric.value)}</strong>
                          <small>{metric.unit || metric.source || "нет данных"}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

            </div>

            <div className="air-map-timeline air-map-timeline-under">
              <div className="air-map-timeline-head">
                <div>
                  <span>Шкала времени</span>
                  <small>{selectedTimestampLabel}</small>
                </div>
                <span className="pill">{selectedTimestampHourLabel}</span>
              </div>
              <div className="air-map-slider-wrap">
                <input
                  className="air-map-slider"
                  type="range"
                  min={0}
                  max={Math.max(timelineForRender.length - 1, 0)}
                  step={1}
                  value={selectedTimelineIndex}
                  onChange={(event) => {
                    const nextEntry = timelineForRender[Number(event.target.value)];
                    if (nextEntry) {
                      setSelectedTimestamp(nextEntry.timestamp);
                    }
                  }}
                />
                <div className="air-map-slider-marks">
                  {timelineMarks.map((mark) => (
                    <span
                      key={`${mark.index}-${mark.label}`}
                      style={{ left: `${timelineForRender.length > 1 ? (mark.index / (timelineForRender.length - 1)) * 100 : 0}%` }}
                    >
                      {mark.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="air-map-timeline-meta">
                <span>{getTimelineKindLabel(timelineEntry?.kind ?? "history")}</span>
                <strong>{selectedTimestampLabel}</strong>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Прогноз по городу" subtitle="Все показатели вынесены в компактные двухколоночные графики без обзорных карточек.">
        {forecast ? (
          <div className="air-forecast-stack">
            <ForecastChart records={selectedCityChartRecords} variant="compact" />
          </div>
        ) : (
          <EmptyState title="Прогноз пока отсутствует" description="Как только появится успешный forecast run, здесь автоматически появится модельный слой по городу." />
        )}
      </Panel>
    </div>
  );
}
