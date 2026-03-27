import React from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import { StatusPage } from "./pages/StatusPage";
import { AnnouncePage } from "./pages/AnnouncePage";
import { PreviewPage } from "./pages/PreviewPage";
import "./styles/global.css";

export default function App() {
  const [location] = useLocation();

  return (
    <div className="app">
      <nav className="nav">
        <Link href="/" className="nav__logo">
          <div className="nav__logo-icon">✕</div>
          CrossPost
        </Link>

        <ul className="nav__links">
          <li>
            <Link
              href="/"
              className={`nav__link${location === "/" ? " nav__link--active" : ""}`}
            >
              status
            </Link>
          </li>
          <li>
            <Link
              href="/announce"
              className={`nav__link${location === "/announce" ? " nav__link--active" : ""}`}
            >
              announce
            </Link>
          </li>
        </ul>

        <div className="nav__status">
          <div className="nav__dot nav__dot--green" />
          local
        </div>
      </nav>

      <Switch>
        <Route path="/" component={StatusPage} />
        <Route path="/announce" component={AnnouncePage} />
        <Route path="/preview/:sessionId" component={PreviewPage} />
      </Switch>
    </div>
  );
}
