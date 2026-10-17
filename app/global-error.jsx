"use client";

export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, background: "#10182b", color: "#f3efff" }}>
        <h1>PinDrop couldn’t load.</h1>
        <p>Please try again in a moment.</p>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
