"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import { Layers, List, MapPin, Navigation, RefreshCw } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import ErrorBoundary from "./ErrorBoundary";
import { CAMPUS, CATEGORY_COLORS, COMMUNITY_CATEGORIES } from "@/lib/constants";
import { pinColor, pinIconKey } from "@/lib/pins";
import { useUi } from "@/lib/store";

// MapLibre can't find its worker inside the Next.js bundle; it is copied to
// public/vendor by scripts/copy-maplibre-worker.mjs.
setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${getVersion()}`);

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// Raster tiles. OpenStreetMap's own servers are fine for light use under
// their tile policy; set NEXT_PUBLIC_MAP_TILE_URL to a commercial or
// self-hosted provider for heavier traffic.
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ||
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

function mapStyle(dark) {
  return {
    version: 8,
    // Self-hosted glyphs for cluster numbers (public/fonts).
    glyphs: `${window.location.origin}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      tiles: {
        type: "raster",
        tiles: [TILE_URL],
        tileSize: 256,
        attribution: TILE_ATTRIBUTION,
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": dark ? "#111b30" : "#eeeef4" },
      },
      {
        id: "streets",
        type: "raster",
        source: "tiles",
        paint: {
          "raster-opacity": dark ? 0.56 : 1,
          "raster-saturation": dark ? -0.85 : -0.35,
          "raster-brightness-max": dark ? 0.6 : 1,
          "raster-contrast": dark ? 0.1 : 0,
        },
      },
    ],
  };
}

// Draws a coloured circle with the category symbol as an image. Cached by
// key ("pd-<group>-<hex colour>"), so each symbol is drawn once per page.
// (globalThis.Map: "Map" here is the react-map-gl component.)
const pinImages = new globalThis.Map();
function pinImage(key) {
  if (!pinImages.has(key)) {
    pinImages.set(
      key,
      // Wait a microtask so React rendering never runs inside a React effect.
      Promise.resolve().then(
        () =>
          new Promise((resolve, reject) => {
            const [, group, color] = key.split("-");
            const container = document.createElement("div");
            const root = createRoot(container);
            flushSync(() =>
              root.render(
                <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="30" fill={"#" + color} stroke="#f3efff" strokeWidth="3" />
                  <CategoryIcon group={group} x={21} y={21} size={30} color="#172136" strokeWidth={2.2} />
                </svg>,
              ),
            );
            const markup = container.innerHTML;
            root.unmount();
            const image = new Image(72, 72);
            image.onload = () => resolve(image);
            image.onerror = () => {
              pinImages.delete(key);
              reject(new Error("Pin symbol failed to load"));
            };
            image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
          }),
      ),
    );
  }
  return pinImages.get(key);
}

// MapLibre asks for pin symbols as layers need them and waits for this.
function resolvePinImage(map) {
  return async (key) => {
    if (!/^pd-[a-z]+-[a-f0-9]{6}$/.test(key)) return;
    try {
      const image = await pinImage(key);
      if (map.getStyle() && !map.hasImage(key)) map.addImage(key, image, { pixelRatio: 2 });
    } catch {}
  };
}

function MapLegend() {
  return (
    <details className="map-legend">
      <summary>
        <Layers size={16} />
        Map key
      </summary>
      <div className="map-legend-body">
        <h3>Recognize a category</h3>
        <div className="category-key">
          {COMMUNITY_CATEGORIES.map((group) => (
            <span key={group.id}>
              <i
                className="legend-category-symbol"
                style={{ background: CATEGORY_COLORS[group.id] }}
              >
                <CategoryIcon group={group.id} size={16} color="#172136" />
              </i>
              {group.label}
            </span>
          ))}
        </div>
        <p>
          Each color and symbol identifies a community category. Pin cards show
          whether a listing is a request, offer, event, place or alert.
        </p>
        <p>
          Numbered clusters combine several categories. Zoom in to reveal each
          listing’s color and symbol.
        </p>
        <p>
          Sample pins are fictional examples, including their people, locations
          and availability.
        </p>
      </div>
    </details>
  );
}

function currentView() {
  const { center, zoom } = useUi.getState();
  return { longitude: center.lng, latitude: center.lat, zoom };
}

export default function MapView({
  pins,
  selected,
  onSelect,
  fix,
  heading,
  follow,
  route,
  headingUp,
  draft,
  onDraft,
  homeKey,
  areaFocus,
  zoomRequest,
  onManualMove,
  onBrowseList,
  onRetry,
  onStatusChange,
}) {
  const mapRef = useRef(null);
  const theme = useUi((s) => s.theme);
  const setUi = useUi((s) => s.set);
  // One status, so the loading indicator and the error never show together.
  // The parent remounts this component to retry (see PinDropApp).
  const [status, setStatus] = useState("loading"); // loading | ready | failed
  // "webgl" when the map couldn't start on this device; "load" otherwise.
  const [failure, setFailure] = useState(null);
  const loaded = status === "ready";
  const fail = (reason) => {
    setFailure(reason);
    setStatus("failed");
  };
  const [tilesFailing, setTilesFailing] = useState(false);
  const tileErrors = useRef(0);
  const firstHome = useRef(true);
  const style = useMemo(() => mapStyle(theme === "dark"), [theme]);

  // Each attempt starts where the person last looked, so a retry keeps their
  // place (filters and search live in the store and are untouched).
  const [initialView] = useState(currentView);

  useEffect(() => {
    onStatusChange?.(status, failure);
  }, [status, failure, onStatusChange]);

  // A map that never finishes loading (stalled worker, blocked network)
  // counts as failed so the person can retry or use the list.
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => {
      setFailure("load");
      setStatus((current) => (current === "loading" ? "failed" : current));
    }, 20000);
    return () => clearTimeout(timer);
  }, [status]);

  // react-map-gl attaches the map after its own setup, so register the pin
  // symbol resolver from a callback ref, before the pin layers ask for them.
  const attachMap = useCallback((instance) => {
    mapRef.current = instance;
    const map = instance?.getMap();
    map?.setMissingStyleImageResolver(resolvePinImage(map));
  }, []);

  // Fly to the selected pin.
  useEffect(() => {
    if (!loaded || !selected) return;
    mapRef.current?.flyTo({
      center: [selected.lng, selected.lat],
      zoom: Math.max(mapRef.current.getZoom(), 16),
      duration: reducedMotion() ? 0 : 700,
      padding: {
        left: innerWidth >= 1024 ? 390 : 0,
        right: 30,
        top: 110,
        bottom: innerWidth < 1024 ? innerHeight * 0.32 : 50,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, loaded]);

  // Follow the user's live location.
  useEffect(() => {
    if (!fix || !follow || !loaded) return;
    mapRef.current?.easeTo({
      center: [fix.lng, fix.lat],
      zoom: Math.max(mapRef.current.getZoom(), 16),
      bearing: (headingUp && heading) || 0,
      duration: reducedMotion() ? 0 : 700,
    });
  }, [fix, follow, headingUp, heading, loaded]);

  // "Return to De Anza" button.
  useEffect(() => {
    if (firstHome.current) {
      firstHome.current = false;
      return;
    }
    mapRef.current?.flyTo({
      center: [CAMPUS.lng, CAMPUS.lat],
      zoom: 16,
      bearing: 0,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      duration: reducedMotion() ? 0 : 700,
    });
  }, [homeKey]);

  // Show the whole route when previewing directions.
  useEffect(() => {
    if (!loaded || !route || follow || !route.coordinates.length) return;
    const bounds = route.coordinates.reduce(
      (box, [lng, lat]) => [
        Math.min(box[0], lng),
        Math.min(box[1], lat),
        Math.max(box[2], lng),
        Math.max(box[3], lat),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    mapRef.current?.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        maxZoom: 17,
        padding: {
          left: innerWidth >= 1024 ? 410 : 40,
          right: 45,
          top: innerWidth < 1024 ? 100 : 150,
          bottom: innerWidth < 1024 ? innerHeight * 0.58 : 60,
        },
        duration: reducedMotion() ? 0 : 700,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, loaded]);

  // Jump to a neighborhood chosen from the area picker.
  useEffect(() => {
    if (!loaded || !areaFocus) return;
    mapRef.current?.flyTo({
      center: [areaFocus.lng, areaFocus.lat],
      zoom: areaFocus.zoom,
      bearing: 0,
      padding: {
        left: innerWidth >= 1024 ? 390 : 0,
        right: 30,
        top: 90,
        bottom: innerWidth < 1024 ? innerHeight * 0.32 : 40,
      },
      duration: reducedMotion() ? 0 : 900,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaFocus?.key, loaded]);

  // Zoom buttons.
  useEffect(() => {
    if (!loaded || !zoomRequest || !mapRef.current) return;
    mapRef.current.easeTo({
      zoom: Math.max(3, Math.min(19, mapRef.current.getZoom() + zoomRequest.delta)),
      duration: reducedMotion() ? 0 : 350,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomRequest?.key, loaded]);

  // Rebuilt only when the pins or selection change, not on every render.
  const selectedId = selected?.id;
  const features = useMemo(
    () => ({
      type: "FeatureCollection",
      features: pins.map((pin) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
        properties: {
          id: pin.id,
          color: pinColor(pin),
          icon: pinIconKey(pin),
          selected: pin.id === selectedId,
        },
      })),
    }),
    [pins, selectedId],
  );

  async function onClick(event) {
    if (draft) {
      onDraft({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      return;
    }
    const feature = event.features?.[0];
    if (!feature) return;
    if (feature.properties?.cluster) {
      const zoom = await mapRef.current
        ?.getSource("pins")
        .getClusterExpansionZoom(feature.properties.cluster_id);
      mapRef.current?.easeTo({
        center: feature.geometry.coordinates,
        zoom,
        duration: reducedMotion() ? 0 : 450,
      });
    } else {
      onSelect(String(feature.properties?.id));
    }
  }

  return (
    <div className="map-stage">
      {/* WebGL being unavailable makes MapLibre throw while starting up. */}
      <ErrorBoundary fallback={null} onError={() => fail("webgl")}>
      <Map
        ref={attachMap}
        initialViewState={initialView}
        mapStyle={style}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["pin-icons", "pin-points", "clusters"]}
        onLoad={() => setStatus("ready")}
        onError={(event) => {
          // Tile failures are reported here too; a few are normal when panning
          // quickly, many in a row mean the tile server is unreachable.
          if (event.error?.status || /tile|Failed to fetch|NetworkError/i.test(event.error?.message || "")) {
            tileErrors.current += 1;
            if (tileErrors.current >= 6) setTilesFailing(true);
            return;
          }
          if (!loaded) fail(/webgl/i.test(event.error?.message || "") ? "webgl" : "load");
        }}
        onData={(event) => {
          if (event.dataType === "source" && event.tile && tileErrors.current) {
            tileErrors.current = 0;
            setTilesFailing(false);
          }
        }}
        onMoveStart={(event) => {
          if (event.originalEvent) onManualMove();
        }}
        onMoveEnd={(event) => {
          const bounds = event.target.getBounds();
          const center = event.target.getCenter();
          setUi({
            center: { lat: center.lat, lng: center.lng },
            zoom: event.target.getZoom(),
            bbox: [
              bounds.getWest(),
              bounds.getSouth(),
              bounds.getEast(),
              bounds.getNorth(),
            ],
          });
        }}
        onClick={onClick}
        attributionControl={{ compact: true }}
      >
        <Source
          id="pins"
          type="geojson"
          data={features}
          cluster
          clusterMaxZoom={17}
          clusterRadius={45}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": "#344661",
              "circle-radius": ["step", ["get", "point_count"], 21, 10, 27, 30, 34],
              "circle-stroke-width": 3,
              "circle-stroke-color": "#b6c2d4",
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
              "text-font": ["Noto Sans Bold"],
            }}
            paint={{ "text-color": "#fff" }}
          />
          <Layer
            id="pin-points"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": ["get", "color"],
              "circle-radius": ["case", ["get", "selected"], 13, 9],
              "circle-stroke-color": "#f6f1ff",
              "circle-stroke-width": ["case", ["get", "selected"], 4, 2],
              "circle-opacity": 0.96,
            }}
          />
          <Layer
            id="pin-icons"
            type="symbol"
            filter={["!", ["has", "point_count"]]}
            layout={{
              "icon-image": ["get", "icon"],
              "icon-size": ["case", ["get", "selected"], 1.25, 1],
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "symbol-sort-key": ["case", ["get", "selected"], 1, 0],
            }}
          />
        </Source>
        {route && (
          <Source
            id="route"
            type="geojson"
            data={{
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: route.coordinates },
            }}
          >
            <Layer
              id="route-line"
              type="line"
              paint={{
                "line-color": "#ac8aff",
                "line-width": 5,
                "line-opacity": 0.9,
                ...(route.fallback ? { "line-dasharray": [2, 2] } : {}),
              }}
            />
          </Source>
        )}
        {fix && (
          <Marker
            longitude={fix.lng}
            latitude={fix.lat}
            anchor="center"
            rotation={heading || 0}
            rotationAlignment="map"
          >
            <div
              className="location-halo"
              title={`Your location · accuracy ±${Math.round(fix.accuracy)} m`}
            >
              <Navigation
                size={21}
                fill="currentColor"
                style={{ transform: "rotate(-45deg)", transition: "transform .35s ease" }}
              />
            </div>
          </Marker>
        )}
        {draft && (
          <Marker
            longitude={draft.lng}
            latitude={draft.lat}
            draggable
            onDragEnd={(event) =>
              onDraft({ lat: event.lngLat.lat, lng: event.lngLat.lng })
            }
          >
            <div className="draft-marker">
              <MapPin size={38} fill="currentColor" />
            </div>
          </Marker>
        )}
      </Map>
      </ErrorBoundary>
      <MapLegend />
      {status === "failed" && (
        <div className="map-message map-failed" role="alert">
          <strong>The map couldn’t load.</strong>
          <span>Search, filters and pin details still work from the list.</span>
          <div className="map-message-actions">
            <button className="primary" onClick={onRetry}>
              <RefreshCw size={15} /> Retry
            </button>
            <button className="secondary" onClick={onBrowseList}>
              <List size={15} /> Browse list
            </button>
          </div>
        </div>
      )}
      {tilesFailing && loaded && (
        <div className="map-message tiles" role="status">
          Street map tiles aren’t loading (you may be offline). Pins are still shown.
        </div>
      )}
      {status === "loading" && (
        <div className="map-loading" role="status">
          <span className="pulse-dot" />
          Loading your neighborhood…
        </div>
      )}
    </div>
  );
}
