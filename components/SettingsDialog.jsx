"use client";

import { useState } from "react";
import { Database, Download, Eye, MapPin, Moon, ShieldOff } from "lucide-react";
import Dialog from "./Dialog";
import { usePins, useUi } from "@/lib/store";

function Toggle({ label, checked, onChange }) {
  return (
    <button
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className={"toggle " + (checked ? "on" : "")}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export default function SettingsDialog({ onClose, onError }) {
  const theme = useUi((s) => s.theme);
  const nearby = useUi((s) => s.nearby);
  const showSamples = useUi((s) => s.showSamples);
  const { setPreference, notify } = useUi.getState();
  const blocked = usePins((s) => s.blocked);
  const legacyPins = usePins((s) => s.legacyPins);
  const user = usePins((s) => s.user);
  const [unblocking, setUnblocking] = useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title="Make yourself at home."
      description={
        user
          ? "Preferences are saved to your account and follow you to other devices."
          : "Preferences are saved in this browser. Sign in to keep them on every device."
      }
    >
      <div className="setting-row">
        <div>
          <Moon size={19} aria-hidden="true" />
          <span>
            Dark mode
            <small>Midnight blue &amp; soft violet</small>
          </span>
        </div>
        <Toggle
          label="Dark mode"
          checked={theme === "dark"}
          onChange={(on) => setPreference({ theme: on ? "dark" : "light" })}
        />
      </div>
      <div className="setting-row">
        <div>
          <MapPin size={19} aria-hidden="true" />
          <span>
            Nearby only
            <small>Within 1.5 km of the map center</small>
          </span>
        </div>
        <Toggle label="Nearby only" checked={nearby} onChange={(on) => setPreference({ nearby: on })} />
      </div>
      <div className="setting-row">
        <div>
          <Eye size={19} aria-hidden="true" />
          <span>
            Show sample pins
            <small>Fictional examples, clearly labelled</small>
          </span>
        </div>
        <Toggle
          label="Show sample pins"
          checked={showSamples}
          onChange={(on) => setPreference({ showSamples: on })}
        />
      </div>
      {blocked.length > 0 && (
        <div className="local-note">
          <ShieldOff size={19} aria-hidden="true" />
          <div>
            <strong>Blocked neighbors</strong>
            <p>You don’t see their pins, and you can’t respond to or message each other.</p>
            <ul className="blocked-list">
              {blocked.map((person) => (
                <li key={person.id}>
                  {person.name}
                  <button
                    className="text-button"
                    disabled={unblocking === person.id}
                    onClick={async () => {
                      setUnblocking(person.id);
                      try {
                        await usePins.getState().unblock(person.id);
                        notify(`${person.name} is unblocked.`);
                      } catch (error) {
                        onError(error);
                      } finally {
                        setUnblocking("");
                      }
                    }}
                  >
                    {unblocking === person.id ? "Unblocking…" : "Unblock"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="local-note">
        <Database size={19} aria-hidden="true" />
        <div>
          <strong>Shared, with a copy on this device.</strong>
          <p>
            Pins are stored on PinDrop’s server so everyone sees the same map. A copy of recent
            pins is kept in this browser for offline use. Live location is never saved.
          </p>
        </div>
      </div>
      {legacyPins.length > 0 && (
        <button
          className="secondary full"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify({ version: 1, pins: legacyPins }, null, 2)], {
                type: "application/json",
              }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "pindrop-local-pins.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1e3);
          }}
        >
          <Download size={16} /> Download {legacyPins.length} pins from the earlier device-only
          version
        </button>
      )}
    </Dialog>
  );
}
