(() => {
  const entries = [
    ['discovery', '#discoveryControls', 'Discovery controls', 'Move towards More like my taste to favour your ratings and favourite artists, or Surprise me for more random picks within the selected genre. Fresh tunes focuses on newer uploads.'],
    ['player', '.track-summary', 'Player and feedback', 'Roll selects a track; press Play on the SoundCloud player to listen. Stars record your rating. Favourite artist follows the uploader to show their recent uploads.'],
    ['downloads', '#downloadAssistant', 'Download assistant', 'Open the download or purchase pages linked from the selected track, then complete any requirements in your browser. Saving your email or comment here does not submit anything to an artist.'],
    ['uploads', '#feedPanel', 'Latest from favourites', 'Recent uploads from artists you have favourited. Preview opens a track in the player. Refresh checks the favourite profiles again.'],
    ['artists', '#artistPanel', 'Favourite artists', 'Favourite an artist from the player to see their uploads. Removing an artist stops their uploads appearing in your favourites feed.'],
    ['charts', '#chartPanel', 'Hypeddit charts', 'Charts load here automatically. Changing genre reloads the chart. Use Open chart in browser for sign-in or pages outside this viewer. Download requirements are handled on the artist or download site.'],
    ['email', '#mail', 'DJ email', 'Optional email address to copy and paste into download forms. It is saved on this PC and is never sent automatically. You can leave it blank.'],
    ['comment', '#comment', 'Download comment', 'Optional reusable message to copy and paste when a download page asks for feedback. It stays on this PC; saving it here does not post a comment.']
  ];
  for (const [id, selector, title, text] of entries) {
    let host = document.querySelector(selector);
    if (!host) continue;
    if (id === 'email' || id === 'comment') {
      const label = host.closest('label');
      host = document.createElement('div');
      host.className = 'context-help-field';
      label.before(host);
      host.append(label);
      const caption = document.createElement('span');
      caption.className = 'context-help-field-label';
      caption.append(label.firstChild);
      label.prepend(caption);
    }
    host.classList.add('context-help-host');
    if (id === 'discovery') host.classList.add('context-help-controls');
    if (id === 'player') host.classList.add('context-help-track');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-help-trigger';
    button.dataset.contextHelp = id;
    button.textContent = '?';
    button.setAttribute('aria-label', 'Help: ' + title);
    button.setAttribute('aria-expanded', 'false');
    const popup = document.createElement('div');
    popup.id = 'context-help-' + id;
    popup.className = 'context-help-popover';
    popup.setAttribute('popover', 'auto');
    popup.setAttribute('role', 'tooltip');
    button.setAttribute('popovertarget', popup.id);
    button.setAttribute('aria-describedby', popup.id);
    if (id === 'email' || id === 'comment') document.querySelector(selector).setAttribute('aria-describedby', popup.id);
    const heading = document.createElement('strong');
    heading.textContent = title;
    const description = document.createElement('p');
    description.textContent = text;
    popup.append(heading, description);
    host.append(button);
    document.body.append(popup);
    let pinned = false, hovered = false, focused = false, closeTimer;
    const hide = () => { if (popup.matches(':popover-open')) popup.hidePopover(); };
    const show = () => {
      clearTimeout(closeTimer);
      if (!popup.matches(':popover-open')) popup.showPopover({source: button});
    };
    const leave = () => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => { if (!pinned && !hovered && !focused) hide(); }, 150);
    };
    for (const element of [button, popup]) {
      element.addEventListener('pointerenter', () => { hovered = true; show(); });
      element.addEventListener('pointerleave', () => { hovered = false; leave(); });
    }
    button.addEventListener('focus', () => { focused = true; show(); });
    button.addEventListener('blur', () => { focused = false; pinned = false; leave(); });
    button.addEventListener('click', event => {
      event.preventDefault();
      pinned = !pinned;
      if (pinned) show(); else hide();
    });
    popup.addEventListener('toggle', () => {
      const open = popup.matches(':popover-open');
      button.setAttribute('aria-expanded', String(open));
      if (!open) { pinned = false; clearTimeout(closeTimer); }
    });
  }
})();
