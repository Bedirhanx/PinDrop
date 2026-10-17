"use client";

import { Component } from "react";

// Keeps one broken part of the screen (such as the map when WebGL is
// unavailable) from taking down the rest of the app.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
