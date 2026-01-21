/**
 * Global styles for drop.md
 * Minimal. Monochrome. Easy on the eyes.
 */
export function styles(): string {
  return `
    :root {
      --bg: #1f1f1f;
      --surface: #171717;
      --border: #2a2a2a;
      --text: #e0e0e0;
      --text-muted: #888;
      --text-dim: #555;
      --font: 'Geist Mono', monospace;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ===== LANDING ===== */
    .landing {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 2rem;
    }

    .landing-content {
      text-align: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 400;
      margin-bottom: 0.25rem;
      letter-spacing: -0.02em;
    }

    .logo-dot {
      color: var(--text-muted);
    }

    .tagline {
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 3rem;
    }

    .ttl-selector {
      display: flex;
      gap: 1px;
      justify-content: center;
      margin-bottom: 1rem;
      background: var(--border);
    }

    .ttl-btn {
      background: var(--surface);
      border: none;
      color: var(--text-muted);
      font-family: var(--font);
      font-size: 13px;
      padding: 0.5rem 1rem;
      cursor: pointer;
      transition: color 0.1s;
    }

    .ttl-btn:hover {
      color: var(--text);
    }

    .ttl-btn.selected {
      background: var(--text);
      color: var(--bg);
    }

    .create-btn {
      background: var(--text);
      border: none;
      color: var(--bg);
      font-family: var(--font);
      font-size: 13px;
      padding: 0.5rem 1.5rem;
      cursor: pointer;
      transition: opacity 0.1s;
    }

    .create-btn:hover:not(:disabled) {
      opacity: 0.85;
    }

    .create-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .spinner {
      width: 12px;
      height: 12px;
      border: 1.5px solid var(--bg);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.5s linear infinite;
      display: inline-block;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .hint {
      color: var(--text-dim);
      font-size: 11px;
      margin-top: 2rem;
    }

    .landing-footer {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
    }

    .footer-text {
      color: var(--text-dim);
      font-size: 11px;
    }

    .footer-text a {
      color: var(--text-dim);
      text-decoration: none;
      border-bottom: 1px solid var(--border);
    }

    .footer-text a:hover {
      color: var(--text-muted);
    }

    /* ===== EDITOR ===== */
    .editor-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      background: var(--surface);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .live-indicator {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--text-muted);
      font-size: 11px;
      text-transform: lowercase;
    }

    .live-indicator.disconnected {
      color: var(--text-dim);
    }

    .live-dot {
      width: 4px;
      height: 4px;
      background: currentColor;
      border-radius: 50%;
    }

    .url-btn {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: none;
      border: none;
      color: var(--text-dim);
      font-family: var(--font);
      font-size: 12px;
      cursor: pointer;
      padding: 0;
    }

    .url-btn:hover {
      color: var(--text-muted);
    }

    .url-btn svg {
      width: 11px;
      height: 11px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .new-btn {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 12px;
    }

    .new-btn:hover {
      color: var(--text-muted);
    }

    .download-btn {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--text-dim);
      text-decoration: none;
      font-size: 12px;
    }

    .download-btn:hover {
      color: var(--text-muted);
    }

    .download-btn svg {
      width: 12px;
      height: 12px;
    }

    .timer {
      color: var(--text-muted);
      font-size: 12px;
    }

    .timer.warning {
      color: var(--text);
    }

    .timer.danger {
      color: var(--text);
    }

    .editor-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      overflow: hidden;
    }

    .editor-scroll {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .editor-spacer-top {
      transition: min-height 0.15s ease-out;
    }

    .editor-wrapper {
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    .editor-spacer-bottom {
      min-height: 50vh;
    }

    .editor {
      width: 100%;
      padding: 0;
      background: transparent;
      border: none;
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.7;
      resize: none;
      outline: none;
      overflow: hidden;
      min-height: 1.7em;
    }

    .editor::placeholder {
      color: var(--text-dim);
    }

    .connection-status {
      position: fixed;
      top: 3.5rem;
      right: 1rem;
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 11px;
      color: var(--text-dim);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .connection-status.visible {
      opacity: 1;
    }

    .status-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--text-muted);
    }

    .editor-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      border-top: 1px solid var(--border);
      font-size: 11px;
      background: var(--surface);
    }

    .presence {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--text-muted);
    }

    .presence-dots {
      display: flex;
      gap: 2px;
    }

    .presence-dot {
      width: 4px;
      height: 4px;
      background: var(--text-muted);
      border-radius: 50%;
    }

    .footer-hint {
      color: var(--text-dim);
      font-size: 11px;
    }

    .footer-hint kbd {
      font-family: var(--font);
    }

    /* ===== NOT FOUND ===== */
    .not-found {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
    }

    .not-found-content {
      text-align: center;
    }

    .not-found-icon {
      color: var(--text-dim);
      margin-bottom: 1rem;
    }

    .not-found-icon svg {
      width: 24px;
      height: 24px;
    }

    .not-found-title {
      font-size: 1.25rem;
      font-weight: 400;
      margin-bottom: 0.5rem;
      color: var(--text-muted);
    }

    .not-found-text {
      color: var(--text-dim);
      font-size: 13px;
      margin-bottom: 2rem;
      line-height: 1.8;
    }

    .not-found-btn {
      display: inline-block;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-family: var(--font);
      font-size: 12px;
      padding: 0.5rem 1rem;
      text-decoration: none;
    }

    .not-found-btn:hover {
      color: var(--text);
      border-color: var(--text-dim);
    }

    /* ===== RESPONSIVE ===== */
    @media (max-width: 500px) {
      .editor-header {
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .editor {
        padding: 1.5rem 1rem;
        font-size: 13px;
      }
    }
  `;
}
