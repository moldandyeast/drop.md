import { styles } from './styles';
import { landingScript } from './scripts/landing-script';

/**
 * Landing page HTML
 */
export function landingPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>drop.md — shared markdown that disappears</title>
  <meta name="description" content="Ephemeral shared markdown. Create, share, disappear. No accounts. No friction.">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.2.0/dist/fonts/geist-mono/style.min.css">
  <style>${styles()}</style>
</head>
<body>
  <div class="landing">
    <div class="landing-content">
      <h1 class="logo">drop<span class="logo-dot">.md</span></h1>
      <p class="tagline">shared markdown that disappears</p>
      
      <div class="ttl-selector">
        <button class="ttl-btn" data-ttl="24h">24h</button>
        <button class="ttl-btn selected" data-ttl="7d">7d</button>
        <button class="ttl-btn" data-ttl="30d">30d</button>
      </div>
      
      <button class="create-btn" id="create-btn">
        <span class="create-btn-text">create</span>
        <span class="create-btn-loading" style="display: none;">
          <span class="spinner"></span>
        </span>
      </button>
      
      <p class="hint">anyone with the link can edit</p>
    </div>
    
    <footer class="landing-footer">
      <span class="footer-text">by <a href="https://x.com/nilsedison" target="_blank">@nilsedison</a> · set in <a href="https://vercel.com/font" target="_blank">geist mono</a></span>
    </footer>
  </div>
  
  <script>${landingScript()}</script>
</body>
</html>`;
}
