(function () {
  const storage = window.localStorage;

  function byId(id) {
    return document.getElementById(id);
  }

  function saveField(id) {
    const element = byId(id);
    if (!element) {
      return;
    }
    const storageKey = `anime-sync:${id}`;
    const existing = storage.getItem(storageKey);
    if (existing) {
      element.value = existing;
    }
    element.addEventListener("input", () => {
      storage.setItem(storageKey, element.value.trim());
      updateMalCommand();
    });
  }

  function randomString(length) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let result = "";
    for (let i = 0; i < bytes.length; i += 1) {
      result += alphabet[bytes[i] % alphabet.length];
    }
    return result;
  }

  function setValue(id, value) {
    const element = byId(id);
    if (element) {
      element.value = value || "";
    }
  }

  function buildUrl(base, params) {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }

  function parseCallback() {
    setValue("current-url", window.location.href);

    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(
      window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash
    );

    const details = [];
    const malCode = query.get("code") || "";
    const queryState = query.get("state") || "";
    const anilistToken = fragment.get("access_token") || fragment.get("token") || "";
    const fragmentState = fragment.get("state") || "";
    const tokenType = fragment.get("token_type") || "";
    const expiresIn = fragment.get("expires_in") || "";
    const error = query.get("error") || fragment.get("error") || "";

    if (malCode) {
      details.push(`MAL code: ${malCode}`);
      setValue("mal-code", malCode);
    }
    if (queryState) {
      details.push(`Query state: ${queryState}`);
    }
    if (anilistToken) {
      details.push(`AniList access_token: ${anilistToken}`);
      setValue("anilist-token", anilistToken);
    }
    if (fragmentState) {
      details.push(`Fragment state: ${fragmentState}`);
    }
    if (tokenType) {
      details.push(`Token type: ${tokenType}`);
    }
    if (expiresIn) {
      details.push(`Expires in: ${expiresIn}`);
    }
    if (error) {
      details.push(`Error: ${error}`);
    }

    setValue(
      "callback-output",
      details.length ? details.join("\n") : "No OAuth values detected in this URL yet."
    );

    updateMalCommand();
  }

  function generateAniListUrl() {
    const clientId = byId("anilist-client-id").value.trim();
    const redirectUri = byId("anilist-redirect-uri").value.trim();
    const state = randomString(24);
    const url = buildUrl("https://anilist.co/api/v2/oauth/authorize", {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      state,
    });
    setValue("anilist-url", url);
  }

  function generateMalUrl() {
    const clientId = byId("mal-client-id").value.trim();
    const redirectUri = byId("mal-redirect-uri").value.trim();
    const codeVerifier = randomString(96);
    const state = randomString(32);

    storage.setItem("anime-sync:mal-code-verifier-generated", codeVerifier);
    storage.setItem("anime-sync:mal-state-generated", state);

    const url = buildUrl("https://myanimelist.net/v1/oauth2/authorize", {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeVerifier,
      code_challenge_method: "plain",
      state,
    });

    setValue("mal-code-verifier", codeVerifier);
    setValue("mal-state", state);
    setValue("mal-url", url);
    updateMalCommand();
  }

  function updateMalCommand() {
    const codeVerifier =
      byId("mal-code-verifier").value.trim() ||
      storage.getItem("anime-sync:mal-code-verifier-generated") ||
      "";
    const clientId = byId("mal-client-id").value.trim();
    const code = byId("mal-code").value.trim();

    const command = [
      'python3 scripts/mal_oauth.py exchange',
      `--client-id "${clientId || "YOUR_CLIENT_ID"}"`,
      '--client-secret "YOUR_CLIENT_SECRET"',
      `--code "${code || "PASTE_CODE_HERE"}"`,
      `--code-verifier "${codeVerifier || "PASTE_CODE_VERIFIER_HERE"}"`,
    ].join(" \\\n  ");

    setValue("mal-command", command);
  }

  ["anilist-client-id", "anilist-redirect-uri", "mal-client-id", "mal-redirect-uri"].forEach(
    saveField
  );

  const storedVerifier = storage.getItem("anime-sync:mal-code-verifier-generated");
  if (storedVerifier) {
    setValue("mal-code-verifier", storedVerifier);
  }

  const storedState = storage.getItem("anime-sync:mal-state-generated");
  if (storedState) {
    setValue("mal-state", storedState);
  }

  byId("anilist-generate").addEventListener("click", generateAniListUrl);
  byId("mal-generate").addEventListener("click", generateMalUrl);

  parseCallback();
})();
