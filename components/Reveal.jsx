"use client";

import { useEffect, useRef, useState } from "react";

// Fades its content up into view the first time it scrolls on screen.
// Reduced-motion users see it immediately (see .reveal in globals.css).
export default function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...props }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setShown(true));
      return;
    }
    // Jumping past an element (anchor links, fast scrolling) never makes it
    // intersect, so also reveal anything that is already above the fold.
    const check = () => {
      if (node.getBoundingClientRect().top < window.innerHeight * 0.95) reveal();
    };
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && reveal(), {
      rootMargin: "0px 0px -5% 0px",
    });
    function reveal() {
      setShown(true);
      observer.disconnect();
      window.removeEventListener("scroll", check);
    }
    observer.observe(node);
    window.addEventListener("scroll", check, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", check);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? "in" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` }}
      {...props}
    >
      {children}
    </Tag>
  );
}
