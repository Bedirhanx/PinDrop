"use client";

import dynamic from "next/dynamic";

// The map, location and storage APIs only exist in the browser.
const PinDropApp = dynamic(() => import("./PinDropApp"), {
  ssr: false,
  loading: () => (
    <div className="startup">
      <p>Opening PinDrop…</p>
    </div>
  ),
});

export default function ClientApp() {
  return <PinDropApp />;
}
