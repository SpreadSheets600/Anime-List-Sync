'use strict';

(function () {
  var SESSION_KEYS = {
    anilistState: 'anilist_state',
    anilistVerifier: 'anilist_verifier',
    malState: 'mal_state',
    malVerifier: 'mal_verifier',
  };

  function genVerifier() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    var out = '';
    var values = new Uint32Array(64);
    crypto.getRandomValues(values);
    for (var i = 0; i < 64; i++) out += chars[values[i] % chars.length];
    return out;
  }

  function base64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function pkceChallenge(verifier) {
    var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64url(new Uint8Array(digest));
  }

  // Redirect URI registered in the OAuth app: https://<user>.github.io/<repo>/callback.html
  function redirectUri() {
    return location.origin + location.pathname.replace(/index\.html$/, '') + 'callback.html';
  }

  async function startFlow(site, clientIdInputId, stateKey, verifierKey) {
    var clientId = document.getElementById(clientIdInputId).value.trim();
    if (!clientId) {
      alert('Enter your client ID for ' + site + ' first (created in step 1).');
      return;
    }
    localStorage.setItem(site + '_client_id', clientId);

    var state = genVerifier(); // random string is enough for CSRF protection
    var verifier = genVerifier();
    var challenge = await pkceChallenge(verifier);
    sessionStorage.setItem(stateKey, state);
    sessionStorage.setItem(verifierKey, verifier);

    var params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri(),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: state,
    });

    var base = site === 'anilist'
      ? 'https://anilist.co/api/v2/oauth/authorize'
      : 'https://myanimelist.net/v1/oauth2/authorize';
    location.href = base + '?' + params.toString();
  }

  function renderRedirectUri() {
    document.querySelectorAll('[data-redirect-uri]').forEach(function (el) {
      el.textContent = redirectUri();
    });
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(
      function () {
        if (btn) {
          var old = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = old; }, 1500);
        }
      },
      function () { alert('Copy failed - select the text manually.'); }
    );
  }

  function formatToken(token) {
    // Split into lines of 40 chars so the token wraps cleanly in the code box.
    var out = '';
    for (var i = 0; i < token.length; i += 40) out += token.slice(i, i + 40) + '\n';
    return out.trim();
  }

  function showToken(site, token) {
    var box = document.getElementById(site + '-result');
    box.hidden = false;
    document.getElementById(site + '-token').textContent = token;
    document.getElementById(site + '-copy').onclick = function (e) {
      copyText(token, e.currentTarget);
    };
  }

  function showError(site, message) {
    var box = document.getElementById(site + '-error');
    box.hidden = false;
    box.textContent = message;
  }

  // ---- AniList: exchange the code in the browser via the TokenExchange
  // mutation (GraphQL endpoint allows browser requests / CORS).

  async function exchangeAniList(code) {
    var res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: 'mutation($code: String!) { TokenExchange(code: $code) }',
        variables: { code: code },
      }),
    });
    var body = await res.json();
    if (!res.ok || !body.data || !body.data.TokenExchange) {
      throw new Error('AniList rejected the code: ' + JSON.stringify(body.errors || body));
    }
    var token = body.data.TokenExchange;

    // Also fetch the username so it can be copied into ANILIST_USERNAME.
    var me = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ query: '{ Viewer { name } }' }),
    }).then(function (r) { return r.json(); });
    var name = me && me.data && me.data.Viewer ? me.data.Viewer.name : '';

    return { token: token, username: name };
  }

  async function handleCallback() {
    var params = new URLSearchParams(location.search);
    var code = params.get('code');
    var state = params.get('state');
    var error = params.get('error');

    if (error) {
      showError('anilist', 'Authorization failed: ' + error + '. Close and try again.');
      showError('mal', 'Authorization failed: ' + error + '. Close and try again.');
      return;
    }
    if (!code || !state) {
      return; // direct visit to callback.html without a flow
    }

    var aniState = sessionStorage.getItem(SESSION_KEYS.anilistState);
    var malState = sessionStorage.getItem(SESSION_KEYS.malState);

    if (aniState && state === aniState) {
      document.getElementById('anilist-progress').hidden = false;
      try {
        var result = await exchangeAniList(code);
        showToken('anilist', result.token);
        document.getElementById('anilist-username').textContent = result.username;
        document.getElementById('anilist-username-ok').hidden = false;
      } catch (e) {
        showError('anilist', e.message);
      } finally {
        sessionStorage.removeItem(SESSION_KEYS.anilistState);
        sessionStorage.removeItem(SESSION_KEYS.anilistVerifier);
      }
    } else if (malState && state === malState) {
      var verifier = sessionStorage.getItem(SESSION_KEYS.malVerifier);
      sessionStorage.removeItem(SESSION_KEYS.malState);
      sessionStorage.removeItem(SESSION_KEYS.malVerifier);
      document.getElementById('mal-code').textContent = code;
      document.getElementById('mal-verifier').textContent = verifier;
      document.getElementById('mal-code-copy').onclick = function (e) {
        copyText(code, e.currentTarget);
      };
      document.getElementById('mal-verifier-copy').onclick = function (e) {
        copyText(verifier, e.currentTarget);
      };
      document.getElementById('mal-steps').hidden = false;
    } else {
      showError('anilist', 'State mismatch - the page was reloaded mid-flow. Go back to the start page and try again.');
    }
  }

  window.AnimeListSyncSite = {
    startAniList: function () {
      return startFlow('anilist', 'anilist-client-id', SESSION_KEYS.anilistState, SESSION_KEYS.anilistVerifier);
    },
    startMAL: function () {
      return startFlow('mal', 'mal-client-id', SESSION_KEYS.malState, SESSION_KEYS.malVerifier);
    },
    init: function () {
      renderRedirectUri();
      ['anilist', 'mal'].forEach(function (site) {
        var saved = localStorage.getItem(site + '_client_id');
        if (saved) {
          var el = document.getElementById(site + '-client-id');
          if (el) el.value = saved;
        }
      });
      handleCallback();
    },
  };
})();
