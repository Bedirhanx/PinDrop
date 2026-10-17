"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Cloud,
  Compass,
  Gift,
  HandHeart,
  House,
  Leaf,
  List,
  LoaderCircle,
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
import ChatWidget from "./ChatWidget";
import CreatePinDialog from "./CreatePinDialog";
import Dialog from "./Dialog";
import ErrorBoundary from "./ErrorBoundary";
import MapView from "./MapView";
import NavigationPanel from "./NavigationPanel";
import PinDetail from "./PinDetail";
import PinFeed from "./PinFeed";
import SettingsDialog from "./SettingsDialog";
import { CAMPUS, MIN_LISTING_ZOOM, NEIGHBORHOODS } from "@/lib/constants";
import { useCompass, useGeolocation, useRoute } from "@/lib/navigation";
import {
  distance,
  effectiveStatus,
  groupsForType,
  inBbox,
  isPlace,
  isRequest,
  matchesSearch,
  pinGroupId,
  rankScore,
} from "@/lib/pins";
import { sampleById, samplesInArea } from "@/lib/samples";
import { saveRecovery, usePins, useUi } from "@/lib/store";

const FILTERS = [
  { id: "all", label: "All pins", icon: MapPin },
  { id: "help", label: "Requesting", icon: HandHeart },
  { id: "offering", label: "Offering", icon: Gift },
  { id: "place", label: "Places", icon: MapPin },
  { id: "alert", label: "Alerts", icon: TriangleAlert },
  { id: "nature", label: "Nature", icon: Leaf },
  { id: "event", label: "Events", icon: CalendarDays },
  { id: "done", label: "Completed", icon: Check },
  { id: "saved", label: "Saved", icon: Check },
  { id: "mine", label: "Mine", icon: UserRound },
];

function matchesFilter(pin, filter, status, userId, saved) {
  switch (filter) {
    case "all":
      return status !== "done";
    case "help":
      return isRequest(pin.type) && status !== "done";
    case "nature":
      return pin.type === "nature" || pin.communityCategory === "environment";
    case "offering":
      return pin.type === "offering" && status !== "done";
    case "place":
      return isPlace(pin.type);
    case "alert":
      return pin.type === "alert";
    case "event":
      return pin.type === "event";
    case "done":
      return status === "done";
    case "saved":
      return saved.includes(pin.id);
    case "mine":
      return !!userId && (pin.authorId === userId || pin.claimantId === userId);
    default:
      return false;
  }
}

function subscribeOnline(callback) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export default function PinDropApp() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const router = useRouter();
  const pathname = usePathname();
  const navigate = useCallback(
    (path) => {
      if (window.location.pathname !== path) router.push(path, { scroll: false });
    },
    [router],
  );

  const ui = useUi(
    useShallow((s) => ({
      filter: s.filter,
      categoryGroup: s.categoryGroup,
      search: s.search,
      zoom: s.zoom,
      center: s.center,
      bbox: s.bbox,
      nearby: s.nearby,
      showSamples: s.showSamples,
      theme: s.theme,
      sheet: s.sheet,
      toast: s.toast,
    })),
  );
  const { set: setUi, notify, setPreference } = useUi.getState();
  const data = usePins(
    useShallow((s) => ({
      ready: s.ready,
      backend: s.backend,
      sync: s.sync,
      pins: s.pins,
      missing: s.missing,
      user: s.user,
      profile: s.profile,
      saved: s.saved,
      blocked: s.blocked,
      authReady: s.authReady,
    })),
  );
  const userId = data.user?.id;

  const [now, setNow] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [homeKey, setHomeKey] = useState(0);
  const [follow, setFollow] = useState(false);
  const [navigationPin, setNavigationPin] = useState(null);
  const [navigating, setNavigating] = useState(false);
  const [travelMode, setTravelMode] = useState("walking");
  const [headingUp, setHeadingUp] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [usePreviewOrigin, setUsePreviewOrigin] = useState(true);
  const [previewOrigin, setPreviewOrigin] = useState(CAMPUS);
  const [zoomRequest, setZoomRequest] = useState(null);
  const [area, setArea] = useState("deanza");
  const [areaFocus, setAreaFocus] = useState(null);
  // Load failure for the pin in the URL, kept with its id so it resets on
  // navigation.
  // Retrying the map remounts it; its status is mirrored here so the list can
  // offer Retry when the map itself is covered (full sheet on phones).
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapStatus, setMapStatus] = useState("loading");
  const [mapFailure, setMapFailure] = useState(null);
  const onMapStatus = useCallback((status, failure) => {
    setMapStatus(status);
    setMapFailure(failure);
  }, []);
  // A device that can't start WebGL can be retried in place. Other failures
  // (map worker, stalled load) leave MapLibre's shared workers broken for
  // this page, so reload, keeping filters, search and the map position.
  const retryMap = useCallback(() => {
    if (mapFailure !== "webgl") {
      saveRecovery();
      window.location.reload();
      return;
    }
    setMapStatus("loading");
    setMapAttempt((count) => count + 1);
  }, [mapFailure]);
  const [pinFailure, setPinFailure] = useState({ id: null, message: "" });
  const [signInOpen, setSignInOpen] = useState(false);

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

  // Errors from store actions: open sign-in when an account is needed.
  const handleError = useCallback(
    (error) => {
      if (error?.signIn) {
        setUi({ signInReason: error.message });
        setSignInOpen(true);
      } else {
        notify(error?.message || "Something went wrong.", "error");
      }
    },
    [notify, setUi],
  );

  useEffect(() => {
    usePins.getState().init().catch(handleError);
    const timer = setInterval(() => setNow(Date.now()), 3e4);
    const onNetwork = () => {
      if (navigator.onLine) usePins.getState().loadArea(useUi.getState().bbox, { force: true });
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        usePins.getState().loadArea(useUi.getState().bbox, { force: true });
      }
    };
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [handleError]);

  // Load pins for the visible area once the map stops moving.
  useEffect(() => {
    if (!data.ready || ui.zoom < MIN_LISTING_ZOOM) return;
    const timer = setTimeout(() => usePins.getState().loadArea(ui.bbox), 350);
    return () => clearTimeout(timer);
  }, [data.ready, ui.bbox, ui.zoom]);

  // Refresh the visible area every minute so deletions and edits show up even
  // if a live update was missed.
  useEffect(() => {
    if (!data.ready) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && useUi.getState().zoom >= MIN_LISTING_ZOOM) {
        usePins.getState().loadArea(useUi.getState().bbox, { force: true });
      }
    }, 6e4);
    return () => clearInterval(timer);
  }, [data.ready]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", ui.theme === "dark");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", ui.theme === "dark" ? "#10182b" : "#f5f4fa");
  }, [ui.theme]);

  useEffect(() => {
    if (location.error) notify(location.error, location.fix ? "info" : "error");
  }, [location.error, location.fix, notify]);

  const pinId = pathname.startsWith("/p/") ? decodeURIComponent(pathname.slice(3)) : undefined;
  const selected = pinId ? data.pins[pinId] || sampleById(pinId) : undefined;
  const pinMissing = !!pinId && !selected && !!data.missing[pinId];
  const pinError = pinFailure.id === pinId ? pinFailure.message : "";
  const retryPin = useCallback(() => {
    setPinFailure({ id: null, message: "" });
    usePins
      .getState()
      .loadPin(pinId)
      .catch((error) => setPinFailure({ id: pinId, message: error.message }));
  }, [pinId]);

  // Fetch the pin in the URL so shared links always show the latest version.
  useEffect(() => {
    if (!pinId || !data.ready || sampleById(pinId)) return;
    let cancelled = false;
    usePins
      .getState()
      .loadPin(pinId)
      .catch((error) => !cancelled && setPinFailure({ id: pinId, message: error.message }));
    return () => {
      cancelled = true;
    };
  }, [pinId, data.ready]);

  const blockedIds = useMemo(() => new Set(data.blocked.map((b) => b.id)), [data.blocked]);

  const areaPins = useMemo(() => {
    const real = Object.values(data.pins);
    return ui.showSamples ? [...real, ...samplesInArea(ui.bbox, ui.zoom)] : real;
  }, [data.pins, ui.showSamples, ui.bbox, ui.zoom]);

  const visiblePins = useMemo(() => {
    if (ui.zoom < MIN_LISTING_ZOOM && ui.filter !== "mine" && ui.filter !== "saved") return [];
    const scored = [];
    for (const pin of areaPins) {
      if (blockedIds.has(pin.authorId)) continue;
      const status = effectiveStatus(pin, now);
      const mine = !!userId && pin.authorId === userId;
      if (status === "archived" && !mine) continue;
      if ((status === "cancelled" || pin.hidden) && !mine) continue;
      if (ui.filter !== "mine" && ui.filter !== "saved" && !inBbox(pin, ui.bbox)) continue;
      if (ui.categoryGroup !== "all" && pinGroupId(pin) !== ui.categoryGroup) continue;
      if (ui.nearby && distance(ui.center, pin) > 1500) continue;
      if (!matchesSearch(pin, ui.search)) continue;
      if (!matchesFilter(pin, ui.filter, status, userId, data.saved)) continue;
      scored.push([rankScore(pin, ui.center, now), pin]);
    }
    return scored.sort((a, b) => b[0] - a[0]).map(([, pin]) => pin);
  }, [areaPins, blockedIds, ui.bbox, ui.center, ui.zoom, ui.nearby, ui.search, ui.filter, ui.categoryGroup, now, userId, data.saved]);

  const pendingOffers = useMemo(
    () =>
      userId
        ? Object.values(data.pins).filter((pin) => pin.authorId === userId && pin.status === "claimed").length
        : 0,
    [data.pins, userId],
  );

  // Filters and search currently narrowing the results, as removable chips.
  const activeFilters = [];
  if (ui.filter !== "all") {
    activeFilters.push({
      id: "filter",
      label: FILTERS.find((f) => f.id === ui.filter)?.label || ui.filter,
      clear: () => setUi({ filter: "all" }),
    });
  }
  if (ui.categoryGroup !== "all") {
    activeFilters.push({
      id: "category",
      label: groupsForType("all").find((g) => g.id === ui.categoryGroup)?.label || ui.categoryGroup,
      clear: () => setUi({ categoryGroup: "all" }),
    });
  }
  if (ui.search.trim()) {
    activeFilters.push({
      id: "search",
      label: `“${ui.search.trim()}”`,
      clear: () => setUi({ search: "" }),
    });
  }
  if (ui.nearby) {
    activeFilters.push({
      id: "nearby",
      label: "Within 1.5 km",
      clear: () => setPreference({ nearby: false }),
    });
  }

  function clearFilters() {
    setUi({ filter: "all", categoryGroup: "all", search: "" });
    if (ui.nearby) setPreference({ nearby: false });
    focusResults();
  }

  // Moves keyboard focus to the result count once the list is on screen.
  const [resultsFocus, setResultsFocus] = useState(0);
  const focusResults = () => setResultsFocus((count) => count + 1);
  useEffect(() => {
    if (resultsFocus && !pinId) document.getElementById("pin-results")?.focus();
  }, [resultsFocus, pinId]);

  // "Browse list" when the map fails: show the full list, keep filters.
  function browseList() {
    stopNavigation();
    if (window.location.pathname !== "/") navigate("/");
    setUi({ sheet: "full" });
    focusResults();
  }

  const selectPin = useCallback(
    (id) => {
      setPreviewOrigin(useUi.getState().center);
      setNavigationPin(null);
      setNavigating(false);
      navigate("/p/" + id);
      setUi({ sheet: "half" });
    },
    [navigate, setUi],
  );

  const stopNavigation = () => {
    setNavigating(false);
    setNavigationPin(null);
    location.stop();
    setFollow(false);
  };

  async function signOutHere() {
    try {
      await usePins.getState().signOut();
      notify("You’re logged out.");
    } catch (error) {
      handleError(error);
    }
  }

  function startCreating() {
    stopNavigation();
    if (!data.backend) {
      notify("Sharing pins needs PinDrop’s community server, which isn’t configured yet.", "error");
      return;
    }
    if (!userId) {
      handleError({ signIn: true, message: "Sign in to drop a pin. It only takes an email." });
      return;
    }
    setCreating(true);
  }

  async function publish(force = false) {
    if (!draft) return;
    if (!force) {
      const nearbyTwin = Object.values(data.pins).find(
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
      const { photo, photoPreview, ...fields } = draft;
      const pin = await usePins.getState().create(fields, photo);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setDraft(null);
      setDuplicate(null);
      navigate("/p/" + pin.id);
      notify(
        pin.approximate
          ? "Your pin is on the map, shown in an approximate area."
          : "Your pin is on the map. Good things start here.",
      );
    } catch (error) {
      setDuplicate(null);
      handleError(error);
    } finally {
      setPublishing(false);
    }
  }

  const areaName =
    area === "deanza"
      ? "Around De Anza"
      : NEIGHBORHOODS.find((n) => n.id === area)?.name || "In this area";

  let syncLabel;
  if (!data.backend) syncLabel = "Preview · sharing not configured";
  else if (!online || data.sync === "offline") syncLabel = "Offline · showing saved copy";
  else if (data.sync === "error") syncLabel = "Couldn’t refresh · showing saved copy";
  else if (data.sync === "loading") syncLabel = "Updating…";
  else syncLabel = "Live community map";

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
          setPreviewOrigin(useUi.getState().center);
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
        locating={location.tracking && !location.fix}
      />
    );
  } else if (selected) {
    panel = (
      <PinDetail
        key={selected.id}
        pin={selected}
        userId={userId}
        center={ui.center}
        onError={handleError}
        onClose={() => navigate("/")}
        onNavigate={() => {
          setUsePreviewOrigin(!location.fix);
          setNavigationPin(selected);
          setNavigating(false);
          setUi({ sheet: "half" });
        }}
      />
    );
  } else if (pinId) {
    panel = (
      <div className="empty" role={pinMissing || pinError ? "alert" : "status"}>
        {pinMissing ? (
          <>
            <MapPin size={30} />
            <h3>This pin isn’t on the map anymore.</h3>
            <p>It may have been completed and removed, deleted by its author, or the link is incomplete.</p>
          </>
        ) : pinError ? (
          <>
            <CircleAlert size={30} />
            <h3>Couldn’t load this pin.</h3>
            <p>{pinError}</p>
            <button
              className="secondary"
              onClick={retryPin}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <LoaderCircle size={30} className="spin" />
            <h3>Opening pin…</h3>
          </>
        )}
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
            <span className="heading-spark" aria-hidden="true">✳</span>
          </h1>
          <p>A little help is closer than you think.</p>
          {visiblePins.some((pin) => pin.sample) && (
            <p className="sample-feed-note">
              Includes illustrative sample pins from a fictional neighborhood. You can hide them in Settings.
            </p>
          )}
          {ui.search && (
            <p className="search-result-label" role="status">
              Results for “{ui.search}” in this map area.
            </p>
          )}
          <label className="category-filter">
            <span>Community category</span>
            <select
              aria-label="Filter community category"
              value={ui.categoryGroup}
              onChange={(event) => setUi({ categoryGroup: event.target.value })}
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
            <span id="pin-results" tabIndex={-1} role="status">
              <b>{visiblePins.length}</b> {visiblePins.length === 1 ? "pin" : "pins"}
              {ui.filter === "mine" || ui.filter === "saved" ? "" : " in this area"}
            </span>
            <button
              className={ui.nearby ? "active" : ""}
              aria-pressed={ui.nearby}
              onClick={() => setPreference({ nearby: !ui.nearby })}
            >
              <SlidersHorizontal size={13} />
              Nearby only
            </button>
          </div>
          {mapStatus === "failed" && (
            <div className="map-unavailable">
              <CircleAlert size={14} aria-hidden="true" />
              Map unavailable · the list still works.
              <button className="text-button" onClick={retryMap}>
                Retry map
              </button>
            </div>
          )}
          {activeFilters.length > 0 && (
            <div className="active-filters" role="group" aria-label="Active filters">
              {activeFilters.map((item) => (
                <button
                  key={item.id}
                  className="filter-chip"
                  aria-label={`Remove filter: ${item.label}`}
                  onClick={item.clear}
                >
                  {item.label}
                  <X size={12} aria-hidden="true" />
                </button>
              ))}
              <button className="text-button clear-filters" onClick={clearFilters}>
                Clear all
              </button>
            </div>
          )}
        </div>
        {data.ready ? (
          <PinFeed
            pins={visiblePins}
            center={ui.center}
            onSelect={selectPin}
            emptyHint={
              (ui.filter === "mine" || ui.filter === "saved") && !userId
                ? "Sign in to see your pins and saved places."
                : undefined
            }
            activeFilters={activeFilters}
            onClearFilters={clearFilters}
            zoomedOut={ui.zoom < MIN_LISTING_ZOOM && ui.filter !== "mine" && ui.filter !== "saved"}
          />
        ) : (
          <div className="empty">Opening your neighborhood…</div>
        )}
        <div className="community-note">
          <span aria-hidden="true">✳</span>
          <div>
            <strong>Little things make a place.</strong>
            <p>Leave it a little better than you found it.</p>
          </div>
        </div>
        <nav className="panel-footer" aria-label="About PinDrop">
          <Link href="/about">About us</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/about#safety">Safety &amp; privacy</Link>
          {userId && (
            <button className="text-button" onClick={signOutHere}>
              Log out
            </button>
          )}
        </nav>
      </>
    );
  }

  return (
    <main className="app-shell">
      <ErrorBoundary
        fallback={
          <div className="map-stage">
            <div className="map-message map-failed" role="alert">
              <strong>The map couldn’t start on this device.</strong>
              <span>Search, filters and pin details still work from the list.</span>
              <div className="map-message-actions">
                <button className="secondary" onClick={browseList}>
                  <List size={15} /> Browse list
                </button>
              </div>
            </div>
          </div>
        }
      >
        <MapView
          key={mapAttempt}
          onRetry={retryMap}
          onStatusChange={onMapStatus}
          onBrowseList={browseList}
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
      </ErrorBoundary>

      <header className="topbar">
        <Link className="brand" href="/" scroll={false} onClick={stopNavigation}>
          <span className="brand-symbol">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand-mark.webp"
              srcSet="/brand-mark.webp 1x, /brand-mark@2x.webp 2x"
              alt=""
              width={35}
              height={35}
            />
          </span>
          PinDrop
          <span className="brand-period">.</span>
        </Link>
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
            setUi({ sheet: "full" });
          }}
        >
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search opportunities in this area"
            placeholder="Find opportunities, skills, or help…"
            value={ui.search}
            maxLength={100}
            onChange={(event) => {
              setUi({ search: event.target.value });
              if (pathname !== "/") navigate("/");
              if (navigationPin) stopNavigation();
            }}
          />
          {ui.search && (
            <button type="button" aria-label="Clear opportunity search" onClick={() => setUi({ search: "" })}>
              <X size={15} />
            </button>
          )}
        </form>
        <nav className="topbar-links" aria-label="Site">
          <Link href="/about">About us</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="topbar-right">
          <ChatWidget className="in-app" />
          {!online && (
            <span className="offline-pill" role="status">
              <WifiOff size={13} />
              Offline
            </span>
          )}
          <span className={"local-pill" + (data.backend && online ? " live" : "")}>
            {data.backend && online ? <Cloud size={13} /> : <i />}
            {data.backend ? (online ? "Community" : "Saved copy") : "Preview"}
          </span>
          <button className="icon-button" aria-label="Open settings" onClick={() => navigate("/settings")}>
            <Settings2 size={19} />
          </button>
          {userId ? (
            <>
              <button
                className="avatar"
                aria-label={pendingOffers ? `My account, ${pendingOffers} pending offers` : "My account"}
                onClick={() => navigate("/account")}
              >
                {(data.profile?.name || "N").slice(0, 1).toUpperCase()}
                {pendingOffers > 0 && <span className="avatar-badge">{pendingOffers}</span>}
              </button>
              <button className="account-link logout-link" onClick={signOutHere}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link className="account-link" href="/signin">
                Sign in
              </Link>
              <Link className="primary signup-link" href="/signup">
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      <nav className="map-filters" aria-label="Filter pins">
        <label className="area-picker">
          <MapPin size={14} aria-hidden="true" />
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
              setUi({ filter: "all", categoryGroup: "all", search: "" });
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
            aria-pressed={ui.filter === id}
            onClick={() => {
              setUi({
                filter: id,
                categoryGroup: groupsForType(id).some((g) => g.id === ui.categoryGroup)
                  ? ui.categoryGroup
                  : "all",
              });
              navigate("/");
              stopNavigation();
            }}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

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
          aria-label={location.tracking && !location.fix ? "Finding your location" : "Locate me"}
          aria-pressed={follow}
          title="Locate me"
          onClick={() => {
            location.start();
            setFollow(true);
          }}
        >
          {location.tracking && !location.fix ? <LoaderCircle size={20} className="spin" /> : <LocateFixed size={20} />}
        </button>
        <button
          className="map-control compass-control"
          aria-label={`Enable compass. ${compass.status}`}
          title={compass.status}
          onClick={compass.enable}
        >
          <Compass size={22} style={{ transform: `rotate(${compass.heading || 0}deg)` }} />
          <small>{compass.heading === null ? "N" : Math.round(compass.heading) + "°"}</small>
        </button>
        <button
          className="map-control zoom-control"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => setZoomRequest({ delta: 1, key: Date.now() })}
        >
          <Plus size={20} />
        </button>
        <button
          className="map-control zoom-control"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => setZoomRequest({ delta: -1, key: Date.now() })}
        >
          <Minus size={20} />
        </button>
      </div>

      {!draft && (
        <button className="drop-fab" onClick={startCreating}>
          <Plus size={21} />
          <span>Drop a pin</span>
        </button>
      )}
      {draft && (
        <div className="placement-banner" role="region" aria-label="Place your pin">
          <div>
            <MapPin size={21} aria-hidden="true" />
            <span>
              <strong>Put it in the right place.</strong>
              <small>
                {draft.approximate
                  ? "Drag the pin or tap the map · only an approximate area (~400 m) will be shared"
                  : "Drag the pin or tap the map"}
              </small>
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Cancel pin placement"
            onClick={() => {
              if (draft.photoPreview) URL.revokeObjectURL(draft.photoPreview);
              setDraft(null);
            }}
          >
            <X size={18} />
          </button>
          <button className="primary" disabled={publishing} onClick={() => publish()}>
            {publishing ? <LoaderCircle size={16} className="spin" /> : null}
            {publishing ? "Publishing…" : "Publish pin"}
            {!publishing && <ArrowUpRight size={16} />}
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
            setUi({ sheet: ui.sheet === "peek" ? "half" : ui.sheet === "half" ? "full" : "peek" })
          }
        >
          <span />
          <small>{visiblePins.length} pins nearby</small>
          {ui.sheet === "full" ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        {panel}
      </aside>

      <div className="map-status" role="status">
        <span className={"pulse-dot" + (data.sync === "error" || (!online && data.backend) ? " warn" : "")} />
        {syncLabel}
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
      {(pathname === "/account" || signInOpen) && (
        <AccountDialog
          onClose={() => {
            setSignInOpen(false);
            setUi({ signInReason: "" });
            if (pathname === "/account") navigate("/");
          }}
          onError={handleError}
          onShowMine={() => {
            setUi({ filter: "mine", categoryGroup: "all" });
            setSignInOpen(false);
            navigate("/");
          }}
        />
      )}
      {pathname === "/settings" && <SettingsDialog onClose={() => navigate("/")} onError={handleError} />}
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
            {publishing ? "Publishing…" : "Post a separate pin"}
          </button>
          <button
            className="primary"
            onClick={() => {
              if (!duplicate) return;
              selectPin(duplicate.id);
              if (draft?.photoPreview) URL.revokeObjectURL(draft.photoPreview);
              setDraft(null);
              setDuplicate(null);
            }}
          >
            View existing pin
          </button>
        </div>
      </Dialog>
      {/* Always-present live regions, so screen readers reliably announce
          messages; the visible toast below mirrors them. */}
      <div className="sr-only" role="status" aria-live="polite">
        {ui.toast && ui.toast.tone !== "error" ? ui.toast.message : ""}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive">
        {ui.toast?.tone === "error" ? ui.toast.message : ""}
      </div>
      {ui.toast && (
        <div className={"toast " + ui.toast.tone}>
          {ui.toast.tone === "error" ? <CircleAlert size={16} /> : <Check size={16} />}
          {ui.toast.message}
          <button aria-label="Dismiss message" onClick={() => setUi({ toast: null })}>
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
