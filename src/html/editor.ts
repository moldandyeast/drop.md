import { styles } from './styles';
import { editorScript } from './scripts/editor-script';

/**
 * Editor page HTML
 */
export function editorPage(id: string, expiresAt: number, ttl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>drop.md/${id}</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.2.0/dist/fonts/geist-mono/style.min.css">
  <style>${styles()}</style>
</head>
<body>
  <div class="editor-container">
    <header class="editor-header">
      <div class="header-left">
        <span class="live-indicator" title="Live collaboration active">
          <span class="live-dot"></span>
          <span class="live-text">live</span>
        </span>
        <button class="url-btn" id="copy-url" title="Click to copy URL">
          <span class="url-text">/d/${id}</span>
          <span class="copy-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </span>
          <span class="copy-success" style="display: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
        </button>
      </div>
      
      <div class="header-right">
        <a href="/" class="new-btn" title="New document">+ new</a>
        <a href="/d/${id}/raw" class="download-btn" title="Download .md" download="document.md">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>.md</span>
        </a>
        <div class="timer" id="timer" data-expires="${expiresAt}"></div>
      </div>
    </header>
    
    <main class="editor-main">
      <div class="editor-scroll" id="editor-scroll">
        <div class="editor-spacer-top"></div>
        <div class="editor-wrapper">
          <textarea 
            class="editor" 
            id="editor" 
            placeholder="start typing..."
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
          ></textarea>
        </div>
        <div class="editor-spacer-bottom"></div>
      </div>
      <div class="connection-status" id="connection-status">
        <span class="status-dot"></span>
        <span class="status-text">connecting</span>
      </div>
    </main>
    
    <footer class="editor-footer">
      <div class="presence" id="presence">
        <span class="presence-dots"></span>
        <span class="presence-text">connecting...</span>
      </div>
      <div class="footer-hint">
        <kbd>⌘S</kbd> download
      </div>
    </footer>
  </div>
  
  <script type="module">${editorScript(id)}</script>
</body>
</html>`;
}
