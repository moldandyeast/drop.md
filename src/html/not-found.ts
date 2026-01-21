import { styles } from './styles';

/**
 * 404 Not Found page
 */
export function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>gone — drop.md</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.2.0/dist/fonts/geist-mono/style.min.css">
  <style>${styles()}</style>
</head>
<body>
  <div class="not-found">
    <div class="not-found-content">
      <div class="not-found-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 12h8"></path>
        </svg>
      </div>
      <h1 class="not-found-title">gone</h1>
      <p class="not-found-text">
        This document doesn't exist or has expired.<br>
        Everything here is temporary.
      </p>
      <a href="/" class="not-found-btn">create new document</a>
    </div>
  </div>
</body>
</html>`;
}
