"use client";

export default function AppError({ error, reset }) {
  return (
    <main className="startup" role="alert">
      <h1>Something went wrong.</h1>
      <p>PinDrop hit an unexpected problem. Your pins are safe.</p>
      {error?.digest && <p className="form-caption">Reference: {error.digest}</p>}
      <button className="primary" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
