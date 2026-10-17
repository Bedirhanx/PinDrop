"use client";

import { useState } from "react";
import { Database, Download, MapPin, Moon, UserRound } from "lucide-react";
import Dialog from "./Dialog";
import { usePins, useUi, writeSetting } from "@/lib/store";

export default function SettingsDialog({ profile, onClose }) {
  const ui = useUi();
  const [name, setName] = useState(profile.name);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Make yourself at home."
      description="A few preferences for your corner of the world."
    >
      <div className="setting-row">
        <div>
          <Moon size={19} />
          <span>
            Dark mode
            <small>Midnight blue &amp; soft violet</small>
          </span>
        </div>
        <button
          role="switch"
          aria-label="Dark mode"
          aria-checked={ui.theme === "dark"}
          className={"toggle " + (ui.theme === "dark" ? "on" : "")}
          onClick={() => {
            const theme = ui.theme === "dark" ? "light" : "dark";
            ui.set({ theme });
            writeSetting("pindrop-theme", theme);
          }}
        >
          <span />
        </button>
      </div>
      <div className="setting-row">
        <div>
          <MapPin size={19} />
          <span>
            Nearby only
            <small>Within 1.5 km of the map center</small>
          </span>
        </div>
        <button
          role="switch"
          aria-label="Nearby only"
          aria-checked={ui.nearby}
          className={"toggle " + (ui.nearby ? "on" : "")}
          onClick={() => {
            ui.set({ nearby: !ui.nearby });
            writeSetting("pindrop-nearby", String(!ui.nearby));
          }}
        >
          <span />
        </button>
      </div>
      {ui.blocked.length > 0 && (
        <div className="local-note">
          <div>
            <strong>{ui.blocked.length} blocked neighbors</strong>
            <p>Their pins are hidden on this device.</p>
            <button
              className="text-button"
              onClick={() => {
                ui.set({ blocked: [] });
                writeSetting("pindrop-blocked", "[]");
              }}
            >
              Unblock all neighbors
            </button>
          </div>
        </div>
      )}
      <form
        className="profile-form"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await usePins.getState().updateProfile(name);
            ui.notify("Your display name was updated.");
          } catch (error) {
            ui.notify(error.message);
          }
        }}
      >
        <label>
          <UserRound size={18} /> Display name
        </label>
        <div>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            required
          />
          <button className="secondary">Save</button>
        </div>
        <small>Your device identity stays the same when you rename yourself.</small>
      </form>
      <div className="local-note">
        <Database size={19} />
        <div>
          <strong>Local first. Yours to keep.</strong>
          <p>
            Pins are stored on this device in IndexedDB. Live location is never
            saved.
          </p>
        </div>
      </div>
      <button
        className="secondary full"
        onClick={() => {
          const pins = usePins.getState().pins.filter((pin) => !pin.deletedAt);
          const url = URL.createObjectURL(
            new Blob([JSON.stringify({ version: 1, pins }, null, 2)], {
              type: "application/json",
            }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "pindrop-backup.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
        }}
      >
        <Download size={16} /> Export my pin data
      </button>
    </Dialog>
  );
}
