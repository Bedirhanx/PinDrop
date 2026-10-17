import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="startup">
      <h1>This page isn’t on the map.</h1>
      <p>The link may be mistyped, or the page has moved.</p>
      <Link className="primary" href="/">
        Back to PinDrop
      </Link>
    </main>
  );
}
