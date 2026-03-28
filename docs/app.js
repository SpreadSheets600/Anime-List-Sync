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
      updateAnimeScheduleCommand();
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

  function verifyAniListValue(value) {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Paste an AniList token to inspect it.";
    }
    if (trimmed.includes("&state=") || trimmed.includes("?code=")) {
      return "This looks like a redirect URL fragment or query string, not a plain AniList token.";
    }
    if (trimmed.length < 20) {
      return "Too short to be a realistic AniList bearer token.";
    }
    if (/^[A-Za-z0-9._~-]+$/.test(trimmed)) {
      return "Looks plausible for ANILIST_TOKEN. Browser-only format check passed.";
    }
    return "Contains unexpected characters for a plain bearer token.";
  }

  function verifyMalValue(value) {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Paste a MAL value to inspect it.";
    }
    if (trimmed.startsWith("def")) {
      return "Looks like a MAL authorization code, not a refresh token. Exchange it first.";
    }
    if (trimmed.includes("&state=") || trimmed.includes("code=")) {
      return "This looks like the callback payload. Extract the code first.";
    }
    if (trimmed.length < 20) {
      return "Too short to be a realistic MAL token or code.";
    }
    if (/^[A-Za-z0-9._~-]+$/.test(trimmed)) {
      return "Looks like a token-shaped MAL value. It could be an access token or refresh token, but format alone cannot prove which one.";
    }
    return "Contains unexpected characters for a plain MAL token/code value.";
  }

  function verifyAnimeScheduleValue(value) {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Paste an AnimeSchedule token to inspect it.";
    }
    if (trimmed.length < 20) {
      return "Too short to be a realistic AnimeSchedule bearer token.";
    }
    if (/^[A-Za-z0-9._~-]+$/.test(trimmed)) {
      return "Looks plausible for ANIMESCHEDULE_TOKEN. A live API check is still required to prove it is valid.";
    }
    return "Contains unexpected characters for a plain bearer token.";
  }

  function attachVerifier(inputId, outputId, verifyFn) {
    const input = byId(inputId);
    const output = byId(outputId);
    if (!input || !output) {
      return;
    }
    const render = () => {
      output.value = verifyFn(input.value);
    };
    input.addEventListener("input", render);
    render();
  }

  async function fetchJson(url, options) {
    const response = await window.fetch(url, options);
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = text;
    }
    return { response, data };
  }

  async function runAniListLiveCheck() {
    const output = byId("anilist-verify-output");
    const token = byId("anilist-verify-input").value.trim();
    output.value = "Running AniList live check...";
    if (!token) {
      output.value = "Paste an AniList token first.";
      return;
    }

    try {
      const { response, data } = await fetchJson("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: "query { Viewer { id name } }" }),
      });

      if (!response.ok || data?.errors) {
        output.value = `AniList live check failed.\nHTTP: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}`;
        return;
      }

      output.value = `AniList token is valid.\nViewer: ${data.data.Viewer.name}\nViewer ID: ${data.data.Viewer.id}`;
    } catch (error) {
      output.value = `AniList live check failed before API validation.\n${String(error)}`;
    }
  }

  async function runMalLiveCheck() {
    const output = byId("mal-verify-output");
    const value = byId("mal-verify-input").value.trim();
    output.value = "Running MAL live check...";
    if (!value) {
      output.value = "Paste a MAL value first.";
      return;
    }
    if (value.startsWith("def") || value.includes("code=") || value.includes("&state=")) {
      output.value =
        "This looks like a MAL authorization code, not an access token. Exchange it locally first, then live-check the resulting access token.";
      return;
    }

    try {
      const { response, data } = await fetchJson(
        "https://api.myanimelist.net/v2/users/@me?fields=id,name,picture",
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${value}`,
          },
        }
      );

      if (!response.ok) {
        output.value = `MAL live check failed.\nHTTP: ${response.status}\nResponse: ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n\nIf this value is a refresh token, that is expected. Public browser validation only works for MAL access tokens.`;
        return;
      }

      output.value = `MAL access token is valid.\nUser: ${data.name}\nUser ID: ${data.id}\n\nIf you need MAL_REFRESH_TOKEN, this live check does not verify it. Refresh tokens must be exchanged server-side or locally with your client secret.`;
    } catch (error) {
      output.value = `MAL live check failed before API validation.\n${String(error)}\n\nThis can also happen if the browser blocks the cross-origin request.`;
    }
  }

  async function runAnimeScheduleLiveCheck() {
    const output = byId("animeschedule-verify-output");
    const token = byId("animeschedule-verify-input").value.trim();
    output.value = "Running AnimeSchedule live check...";
    if (!token) {
      output.value = "Paste an AnimeSchedule token first.";
      return;
    }

    try {
      const { response, data } = await fetchJson(
        "https://animeschedule.net/api/v3/animelists/oauth",
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        output.value = `AnimeSchedule live check failed.\nHTTP: ${response.status}\nResponse: ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n\nThis check uses the OAuth anime-list endpoint. A plain application token will fail here even if it is otherwise valid, because the sync needs an OAuth2 user token.`;
        return;
      }

      const count = Array.isArray(data?.anime) ? data.anime.length : "unknown";
      output.value = `AnimeSchedule OAuth token is valid for sync.\nList entries returned: ${count}`;
    } catch (error) {
      output.value = `AnimeSchedule live check failed before API validation.\n${String(error)}\n\nThis can also happen if the browser blocks the cross-origin request.`;
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

  function generateAnimeScheduleUrl() {
    const clientId = byId("animeschedule-client-id").value.trim();
    const redirectUri = byId("animeschedule-redirect-uri").value.trim();
    const scope = byId("animeschedule-scope").value.trim();
    const codeVerifier = randomString(96);
    const state = randomString(32);

    storage.setItem(
      "anime-sync:animeschedule-code-verifier-generated",
      codeVerifier
    );
    storage.setItem("anime-sync:animeschedule-state-generated", state);

    const url = buildUrl("https://animeschedule.net/api/v3/oauth2/authorize", {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeVerifier,
      code_challenge_method: "plain",
      state,
      scope,
    });

    setValue("animeschedule-code-verifier", codeVerifier);
    setValue("animeschedule-state", state);
    setValue("animeschedule-url", url);
    updateAnimeScheduleCommand();
  }

  function updateAnimeScheduleCommand() {
    const clientId = byId("animeschedule-client-id").value.trim();
    const redirectUri = byId("animeschedule-redirect-uri").value.trim();
    const code = byId("animeschedule-code").value.trim();
    const codeVerifier =
      byId("animeschedule-code-verifier").value.trim() ||
      storage.getItem("anime-sync:animeschedule-code-verifier-generated") ||
      "";

    const command = [
      'python3 scripts/animeschedule_oauth.py exchange',
      `--client-id "${clientId || "YOUR_APPLICATION_ID"}"`,
      `--redirect-uri "${redirectUri || "YOUR_REDIRECT_URI"}"`,
      `--code "${code || "PASTE_CODE_HERE"}"`,
      `--code-verifier "${codeVerifier || "PASTE_CODE_VERIFIER_HERE"}"`,
    ].join(" \\\n  ");

    setValue("animeschedule-command", command);
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
      details.push("MAL refresh token: not present in callback URL");
      setValue("mal-code", malCode);
      setValue("animeschedule-code", malCode);
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
    updateAnimeScheduleCommand();
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
  ["animeschedule-client-id", "animeschedule-redirect-uri", "animeschedule-scope"].forEach(
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

  const storedAnimeScheduleVerifier = storage.getItem(
    "anime-sync:animeschedule-code-verifier-generated"
  );
  if (storedAnimeScheduleVerifier) {
    setValue("animeschedule-code-verifier", storedAnimeScheduleVerifier);
  }

  const storedAnimeScheduleState = storage.getItem(
    "anime-sync:animeschedule-state-generated"
  );
  if (storedAnimeScheduleState) {
    setValue("animeschedule-state", storedAnimeScheduleState);
  }

  byId("anilist-generate").addEventListener("click", generateAniListUrl);
  byId("mal-generate").addEventListener("click", generateMalUrl);
  byId("animeschedule-generate").addEventListener(
    "click",
    generateAnimeScheduleUrl
  );
  byId("anilist-live-check").addEventListener("click", runAniListLiveCheck);
  byId("mal-live-check").addEventListener("click", runMalLiveCheck);
  byId("animeschedule-live-check").addEventListener(
    "click",
    runAnimeScheduleLiveCheck
  );

  attachVerifier("anilist-verify-input", "anilist-verify-output", verifyAniListValue);
  attachVerifier("mal-verify-input", "mal-verify-output", verifyMalValue);
  attachVerifier(
    "animeschedule-verify-input",
    "animeschedule-verify-output",
    verifyAnimeScheduleValue
  );

  parseCallback();
  updateAnimeScheduleCommand();
})();
