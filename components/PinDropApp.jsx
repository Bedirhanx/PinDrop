"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Gift,
  HandHeart,
  House,
  Leaf,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  TriangleAlert,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";
import AccountDialog from "./AccountDialog";
import CreatePinDialog from "./CreatePinDialog";
import Dialog from "./Dialog";
import MapView from "./MapView";
import NavigationPanel from "./NavigationPanel";
import PinDetail from "./PinDetail";
import PinFeed from "./PinFeed";
import SettingsDialog from "./SettingsDialog";
import { CAMPUS, MIN_LISTING_ZOOM, NEIGHBORHOODS } from "@/lib/constants";
import { useCompass, useGeolocation, useRoute } from "@/lib/navigation";
import {
  categoryGroupFor,
  distance,
  effectiveStatus,
  groupsForType,
  inBbox,
  isPlace,
  isRequest,
  matchesSearch,
  rankScore,
} from "@/lib/pins";
import { usePins, useUi, writeSetting } from "@/lib/store";

const FILTERS = [
  { id: "all", label: "All pins", icon: MapPin },
  { id: "help", label: "Requesting", icon: HandHeart },
  { id: "offering", label: "Offering", icon: Gift },
  { id: "place", label: "Places", icon: MapPin },
  { id: "alert", label: "Alerts", icon: TriangleAlert },
  { id: "nature", label: "Nature", icon: Leaf },
  { id: "event", label: "Events", icon: CalendarDays },
  { id: "done", label: "Completed", icon: Check },
  { id: "mine", label: "Mine", icon: UserRound },
];

// Paths are pushed with the History API so the map never reloads.
function navigate(path) {
  if (window.location.pathname !== path) window.history.pushState(null, "", path);
}

function matchesFilter(pin, filter, status, userId) {
  switch (filter) {
    case "all":
      return true;
    case "help":
      return isRequest(pin.type) && status !== "done";
    case "nature":
      return pin.type === "nature" || pin.communityCategory === "environment";
    case "offering":
      return pin.type === "offering";
    case "place":
      return isPlace(pin.type);
    case "alert":
      return pin.type === "alert";
    case "event":
      return pin.type === "event";
    case "done":
      return status === "done";
    case "mine":
      return pin.authorId === userId || pin.claimantId === userId;
    default:
      return false;
  }
}

export default function PinDropApp() {
  const ui = useUi();
  const data = usePins();
  const pathname = usePathname();
  const profile = data.profile;

  const [now, setNow] = useState(Date.now());
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [homeKey, setHomeKey] = useState(0);
  const [follow, setFollow] = useState(false);
  const [navigationPin, setNavigationPin] = useState(null);
  const [navigating, setNavigating] = useState(false);
  const [travelMode, setTravelMode] = useState("walking");
  const [headingUp, setHeadingUp] = useState(false);
  const [online, setOnline] = useState(true);
  const [duplicate, setDuplicate] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [usePreviewOrigin, setUsePreviewOrigin] = useState(true);
  const [previewOrigin, setPreviewOrigin] = useState(CAMPUS);
  const [zoomRequest, setZoomRequest] = useState(null);
  const [area, setArea] = useState("deanza");
  const [areaFocus, setAreaFocus] = useState(null);

  const location = useGeolocation();
  const compass = useCompass(location.fix?.heading ?? null);
  const origin = useMemo(
    () =>
      (!usePreviewOrigin && location.fix) || {
        ...previewOrigin,
        accuracy: Infinity,
        speed: 0,
        heading: null,
        timestamp: 0,
      },
    [location.fix, previewOrigin, usePreviewOrigin],
  );
  const externalMode = travelMode === "transit" || travelMode === "rideshare";
  const directions = useRoute(
    externalMode ? null : navigationPin,
    origin,
    travelMode === "cycling" ? "cycling" : travelMode === "driving" ? "driving" : "walking",
  );

  useEffect(() => {
    data.init();
    setOnline(navigator.onLine);
    const timer = setInterval(() => setNow(Date.now()), 3e4);
    const onNetwork = () => setOnline(navigator.onLine);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load fictional neighborhood samples for whatever area is on screen.
  useEffect(() => {
    if (data.ready) data.addSamples(ui.bbox, ui.zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.ready, ui.bbox, ui.zoom]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", ui.theme === "dark");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", ui.theme === "dark" ? "#10182b" : "#f5f4fa");
  }, [ui.theme]);

  useEffect(() => {
    if (location.error) ui.notify(location.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.error]);

  const allPins = useMemo(() => data.pins.filter((pin) => !pin.deletedAt), [data.pins]);
  const pinId = pathname.startsWith("/p/")
    ? decodeURIComponent(pathname.slice(3))
    : undefined;
  const selected = pinId ? allPins.find((pin) => pin.id === pinId) : undefined;

  const visiblePins = useMemo(() => {
    if (ui.zoom < MIN_LISTING_ZOOM) return [];
    return allPins
      .filter((pin) => {
        if (ui.blocked.includes(pin.authorId)) return false;
        const status = effectiveStatus(pin, now);
        if (status === "archived" || status === "hidden") return false;
        if (!inBbox(pin, ui.bbox)) return false;
        if (
          ui.categoryGroup !== "all" &&
          (pin.communityCategory || categoryGroupFor(pin.category)?.id) !== ui.categoryGroup
        ) {
          return false;
        }
        if (ui.nearby && distance(ui.center, pin) > 1500) return false;
        if (!matchesSearch(pin, ui.search)) return false;
        return matchesFilter(pin, ui.filter, status, profile?.id);
      })
      .sort((a, b) => rankScore(b, ui.center, now) - rankScore(a, ui.center, now));
  }, [allPins, ui.bbox, ui.center, ui.zoom, ui.nearby, ui.search, ui.filter, ui.categoryGroup, ui.blocked, now, profile?.id]);

  const selectPin = (id) => {
    setPreviewOrigin(ui.center);
    setNavigationPin(null);
    setNavigating(false);
    navigate("/p/" + id);
    ui.set({ sheet: "half" });
  };

  const stopNavigation = () => {
    setNavigating(false);
    setNavigationPin(null);
    location.stop();
    setFollow(false);
  };

  async function publish(force = false) {
    if (!draft) return;
    if (!force) {
      const nearbyTwin = allPins.find(
        (pin) =>
          pin.type === draft.type &&
          pin.category === draft.category &&
          effectiveStatus(pin) === "open" &&
          distance(pin, draft) < 30,
      );
      if (nearbyTwin) {
        setDuplicate(nearbyTwin);
        return;
      }
    }
    setPublishing(true);
    try {
      const pin = await data.create(draft);
      setDraft(null);
      setDuplicate(null);
      navigate("/p/" + pin.id);
      ui.notify("Your pin is on the map. Good things start here.");
    } catch (error) {
      ui.notify(error.message);
    } finally {
      setPublishing(false);
    }
  }

  if (data.error) {
    return (
      <div className="startup">
        <MapPin size={32} />
        <h1>We couldn’t open your local data.</h1>
        <p>{String(data.error)}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Try again
        </button>
        <p>Check that browser storage is enabled.</p>
      </div>
    );
  }

  const areaName =
    area === "deanza"
      ? "Around De Anza"
      : NEIGHBORHOODS.find((n) => n.id === area)?.name || "In this area";

  let panel;
  if (navigationPin) {
    panel = (
      <NavigationPanel
        pin={navigationPin}
        active={navigating}
        mode={travelMode}
        setMode={(mode) => {
          setTravelMode(mode);
          setNavigating(false);
          setFollow(false);
        }}
        origin={origin}
        hasLocation={!usePreviewOrigin && !!location.fix}
        onUseCampus={() => {
          location.stop();
          setUsePreviewOrigin(true);
          setPreviewOrigin(CAMPUS);
          setNavigating(false);
          setFollow(false);
        }}
        onUseMapCenter={() => {
          location.stop();
          setUsePreviewOrigin(true);
          setPreviewOrigin(ui.center);
          setNavigating(false);
          setFollow(false);
        }}
        onStart={() => {
          setNavigating(true);
          setUsePreviewOrigin(false);
          location.start();
          setFollow(true);
        }}
        onStop={stopNavigation}
        route={directions.route}
        loading={directions.loading}
        error={directions.error}
        remaining={directions.remaining}
        arrived={directions.arrived}
        onRetry={directions.retry}
        onRecenter={() => setFollow(true)}
        headingUp={headingUp}
        setHeadingUp={setHeadingUp}
        locationError={usePreviewOrigin ? "" : location.error}
      />
    );
  } else if (selected && profile) {
    panel = (
      <PinDetail
        pin={selected}
        profile={profile}
        center={ui.center}
        onClose={() => navigate("/")}
        onNavigate={() => {
          setUsePreviewOrigin(!location.fix);
          setNavigationPin(selected);
          setNavigating(false);
          ui.set({ sheet: "half" });
        }}
      />
    );
  } else if (pinId && data.ready) {
    panel = (
      <div className="empty">
        <MapPin size={30} />
        <h3>This pin isn’t on this device.</h3>
        <p>It may have been deleted, or it was saved in a different browser.</p>
        <button className="secondary" onClick={() => navigate("/")}>
          Back to map
        </button>
      </div>
    );
  } else {
    panel = (
      <>
        <div className="feed-header">
          <p className="eyebrow">YOUR NEIGHBORHOOD, A LITTLE BETTER</p>
          <h1>
            {areaName}
            <span className="heading-spark">✳</span>
          </h1>
          <p>A little help is closer than you think.</p>
          {visiblePins.some((pin) => pin.sample) && (
            <p className="sample-feed-note">
              Includes illustrative sample pins from a fictional neighborhood.
            </p>
          )}
          {ui.search && (
            <p className="search-result-label">
              Results for “{ui.search}” in this map area.
            </p>
          )}
          <label className="category-filter">
            <span>Community category</span>
            <select
              aria-label="Filter community category"
              value={ui.categoryGroup}
              onChange={(event) => ui.set({ categoryGroup: event.target.value })}
            >
              <option value="all">All community categories</option>
              {groupsForType(ui.filter).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
          <div className="feed-summary">
            <span>
              <b>{visiblePins.length}</b> pins in this area
            </span>
            <button
              className={ui.nearby ? "active" : ""}
              onClick={() => {
                ui.set({ nearby: !ui.nearby });
                writeSetting("pindrop-nearby", String(!ui.nearby));
              }}
            >
              <SlidersHorizontal size={13} />
              Nearby only
            </button>
          </div>
        </div>
        {data.ready ? (
          <PinFeed pins={visiblePins} center={ui.center} onSelect={selectPin} />
        ) : (
          <div className="empty">Opening your neighborhood…</div>
        )}
        <div className="community-note">
          <span>✳</span>
          <div>
            <strong>Little things make a place.</strong>
            <p>Leave it a little better than you found it.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <main className="app-shell">
      <MapView
        onManualMove={() => setFollow(false)}
        pins={visiblePins}
        selected={selected}
        onSelect={selectPin}
        fix={location.fix}
        heading={compass.heading}
        follow={follow}
        route={directions.route}
        headingUp={headingUp}
        draft={draft}
        onDraft={(point) => setDraft((current) => (current ? { ...current, ...point } : null))}
        homeKey={homeKey}
        areaFocus={areaFocus}
        zoomRequest={zoomRequest}
      />

      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigate("/");
            stopNavigation();
          }}
        >
          <span className="brand-symbol">
            <MapPin size={22} fill="currentColor" />
          </span>
          PinDrop
          <span className="brand-period">.</span>
        </a>
        <div className="topbar-divider" />
        <span className="topbar-place">
          De Anza &amp; beyond
          <span>Small acts. Better places.</span>
        </span>
        <form
          className="global-search search-box"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate("/");
            stopNavigation();
            ui.set({ sheet: "full" });
          }}
        >
          <Search size={18} />
          <input
            aria-label="Search opportunities in this area"
            placeholder="Find opportunities, skills, or help…"
            value={ui.search}
            onChange={(event) => {
              ui.set({ search: event.target.value });
              if (pathname !== "/") navigate("/");
              if (navigationPin) stopNavigation();
            }}
          />
          {ui.search && (
            <button
              type="button"
              aria-label="Clear opportunity search"
              onClick={() => ui.set({ search: "" })}
            >
              <X size={15} />
            </button>
          )}
        </form>
        <div className="topbar-right">
          {!online && (
            <span className="offline-pill">
              <WifiOff size={13} />
              Offline
            </span>
          )}
          <span className="local-pill">
            <i /> On this device
          </span>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => navigate("/settings")}
          >
            <Settings2 size={19} />
          </button>
          <button
            className="avatar"
            aria-label="My account"
            onClick={() => navigate("/account")}
          >
            {profile?.name.slice(0, 1) || "Y"}
          </button>
          <button className="account-link" onClick={() => navigate("/account")}>
            Sign in
          </button>
        </div>
      </header>

      <div className="map-filters">
        <label className="area-picker">
          <MapPin size={14} />
          <select
            aria-label="Explore a Bay Area neighborhood"
            value={area}
            onChange={(event) => {
              const id = event.target.value;
              setArea(id);
              const place = id === "deanza" ? CAMPUS : NEIGHBORHOODS.find((n) => n.id === id);
              setAreaFocus({ ...place, zoom: id === "deanza" ? 16 : 15, key: Date.now() });
              navigate("/");
              stopNavigation();
              ui.set({ filter: "all", categoryGroup: "all", search: "" });
            }}
          >
            <option value="deanza">De Anza College</option>
            {NEIGHBORHOODS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={ui.filter === id ? "active" : ""}
            onClick={() => {
              ui.set({
                filter: id,
                categoryGroup: groupsForType(id).some((g) => g.id === ui.categoryGroup)
                  ? ui.categoryGroup
                  : "all",
              });
              navigate("/");
              stopNavigation();
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="map-controls">
        <button
          className="map-control"
          aria-label="Return to De Anza"
          title="Return to De Anza"
          onClick={() => {
            setFollow(false);
            setHomeKey((key) => key + 1);
            setArea("deanza");
          }}
        >
          <House size={19} />
        </button>
        <button
          className={"map-control " + (follow ? "active" : "")}
          aria-label="Locate me"
          title="Locate me"
          onClick={() => {
            location.start();
            setFollow(true);
          }}
        >
          <LocateFixed size={20} />
        </button>
        <button
          className="map-control compass-control"
          aria-label="Enable compass"
          title={compass.status}
          onClick={compass.enable}
        >
          <Compass size={22} style={{ transform: `rotate(${compass.heading || 0}deg)` }} />
          <small>{compass.heading === null ? "N" : Math.round(compass.heading) + "°"}</small>
        </button>
        <button
          className="map-control"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => setZoomRequest({ delta: 1, key: Date.now() })}
        >
          <Plus size={20} />
        </button>
        <button
          className="map-control"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => setZoomRequest({ delta: -1, key: Date.now() })}
        >
          <Minus size={20} />
        </button>
      </div>

      {!draft && (
        <button
          className="drop-fab"
          onClick={() => {
            stopNavigation();
            setCreating(true);
          }}
        >
          <Plus size={21} />
          <span>Drop a pin</span>
        </button>
      )}
      {draft && (
        <div className="placement-banner">
          <div>
            <MapPin size={21} />
            <span>
              <strong>Put it in the right place.</strong>
              <small>
                Drag the pin or tap the map · {draft.lat.toFixed(5)},{" "}
                {draft.lng.toFixed(5)}
              </small>
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Cancel pin placement"
            onClick={() => setDraft(null)}
          >
            <X size={18} />
          </button>
          <button className="primary" disabled={publishing} onClick={() => publish()}>
            {publishing ? "Saving…" : "Publish pin"}
            <ArrowUpRight size={16} />
          </button>
        </div>
      )}

      <aside
        className={`side-panel sheet-${ui.sheet} ${navigationPin ? "navigation-open" : ""} ${draft ? "placing" : ""}`}
        aria-label="Neighborhood pins"
      >
        <button
          className="sheet-handle"
          aria-label="Change panel height"
          onClick={() =>
            ui.set({
              sheet: ui.sheet === "peek" ? "half" : ui.sheet === "half" ? "full" : "peek",
            })
          }
        >
          <span />
          <small>{visiblePins.length} pins nearby</small>
          {ui.sheet === "full" ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        {panel}
      </aside>

      <div className="map-status">
        <span className="pulse-dot" />
        {online ? "Explore your neighborhood" : "Offline · saved pins available"}
        <span className="status-divider" />
        Local-first preview
      </div>

      {creating && (
        <CreatePinDialog
          open
          onClose={() => setCreating(false)}
          center={ui.center}
          onPlace={(values) => {
            setDraft(values);
            setCreating(false);
            navigate("/");
          }}
        />
      )}
      {pathname === "/account" && profile && <AccountDialog onClose={() => navigate("/")} />}
      {pathname === "/settings" && profile && (
        <SettingsDialog profile={profile} onClose={() => navigate("/")} />
      )}
      <Dialog
        open={!!duplicate}
        onClose={() => setDuplicate(null)}
        title="Could this be the same spot?"
        description="There’s already a similar pin within 30 meters."
      >
        <h3>{duplicate?.title}</h3>
        <p className="muted">{duplicate?.description}</p>
        <div className="dialog-actions">
          <button className="secondary" disabled={publishing} onClick={() => publish(true)}>
            Post a separate pin
          </button>
          <button
            className="primary"
            onClick={() => {
              if (!duplicate) return;
              selectPin(duplicate.id);
              setDraft(null);
              setDuplicate(null);
            }}
          >
            View existing pin
          </button>
        </div>
      </Dialog>
      {ui.toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {ui.toast}
        </div>
      )}
    </main>
  );
}
