"use client";

import Dialog from "./Dialog";

// Accounts need a server, which this edition does not include yet.
export default function AccountDialog({ onClose }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="PinDrop on this device"
      description="Explore the map, create pins and save discoveries on this device."
      className="account-dialog"
    >
      <p>
        Signing in and sharing pins between people need a server, which this
        version doesn’t have yet. Your pins are kept in this browser. You can
        change your display name in Settings.
      </p>
      <button className="primary" onClick={onClose}>
        Back to the map
      </button>
    </Dialog>
  );
}
