package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"
)

// TestNonInteractiveMode_Detection verifies when the process refuses to start
// the interactive OAuth flow: --non-interactive flag, NON_INTERACTIVE env,
// CI env, or TOKEN_JSON env.
func TestNonInteractiveMode_Detection(t *testing.T) {
	orig := nonInteractive
	t.Cleanup(func() { nonInteractive = orig })

	flagVal := true
	nonInteractive = &flagVal
	if !nonInteractiveMode() {
		t.Error("expected non-interactive mode when --non-interactive flag is set")
	}

	flagVal = false
	tests := []struct {
		name string
		env  map[string]string
		want bool
	}{
		{"no env vars", nil, false},
		{"CI env", map[string]string{"CI": "true"}, true},
		{"TOKEN_JSON env", map[string]string{"TOKEN_JSON": "{}"}, true},
		{"NON_INTERACTIVE true", map[string]string{"NON_INTERACTIVE": "true"}, true},
		{"NON_INTERACTIVE false", map[string]string{"NON_INTERACTIVE": "false"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			unset := []string{"CI", "TOKEN_JSON", "NON_INTERACTIVE"}
			for _, key := range unset {
				_ = os.Unsetenv(key)
			}
			for key, value := range tt.env {
				t.Setenv(key, value)
			}
			if got := nonInteractiveMode(); got != tt.want {
				t.Errorf("nonInteractiveMode() = %v, want %v", got, tt.want)
			}
		})
	}
}

// TestOAuth_LoadTokenFromEnv verifies tokens are loaded from the TOKEN_JSON
// env var and never written back to the token file.
func TestOAuth_LoadTokenFromEnv(t *testing.T) {
	t.Setenv("TOKEN_JSON", `{"tokens":{"anilist":{"access_token":"tok123","refresh_token":"ref123","token_type":"Bearer"}}}`)

	tokenPath := filepath.Join(t.TempDir(), "token.json")
	oauth, err := NewOAuth(testSiteConfig(), "http://localhost/callback", "anilist",
		[]oauth2.AuthCodeOption{}, tokenPath)
	if err != nil {
		t.Fatalf("NewOAuth() error = %v", err)
	}

	if oauth.NeedInit() {
		t.Error("expected token to be loaded from TOKEN_JSON")
	}
	if !oauth.injected {
		t.Error("expected injected to be true")
	}

	err = oauth.DeleteToken()
	if err != nil {
		t.Fatalf("DeleteToken() error = %v", err)
	}
	_, err = os.Stat(tokenPath)
	if !os.IsNotExist(err) {
		t.Error("expected no token file to be written for env-provided tokens")
	}
}

// TestOAuth_LoadTokenFromEnv_MissingSite verifies that a TOKEN_JSON value
// without the matching site leaves the token unset (still needs init).
func TestOAuth_LoadTokenFromEnv_MissingSite(t *testing.T) {
	t.Setenv("TOKEN_JSON", `{"tokens":{"anilist":{"access_token":"tok"}}}`)

	oauth, err := NewOAuth(testSiteConfig(), "http://localhost/callback", "myanimelist",
		[]oauth2.AuthCodeOption{}, filepath.Join(t.TempDir(), "token.json"))
	if err != nil {
		t.Fatalf("NewOAuth() error = %v", err)
	}

	if !oauth.NeedInit() {
		t.Error("expected token to remain unset when TOKEN_JSON has no matching site")
	}
}

// TestInitOAuthIfNeeded_NonInteractiveFailFast verifies that a missing token
// is a hard error in non-interactive mode instead of starting a browser flow.
func TestInitOAuthIfNeeded_NonInteractiveFailFast(t *testing.T) {
	orig := nonInteractive
	t.Cleanup(func() { nonInteractive = orig })
	flagVal := true
	nonInteractive = &flagVal

	oauth, err := NewOAuth(testSiteConfig(), "http://localhost/callback", "anilist", nil, filepath.Join(t.TempDir(), "token.json"))
	if err != nil {
		t.Fatalf("NewOAuth() error = %v", err)
	}

	_, err = initOAuthIfNeeded(context.Background(), oauth, "18080", true)
	if err == nil {
		t.Fatal("expected error when token missing in non-interactive mode")
	}
	if !strings.Contains(err.Error(), "TOKEN_JSON") {
		t.Errorf("expected error to mention TOKEN_JSON, got: %v", err)
	}
}

// TestInitOAuthIfNeeded_NonInteractiveWithToken verifies that a loaded token
// passes through without error in non-interactive mode.
func TestInitOAuthIfNeeded_NonInteractiveWithToken(t *testing.T) {
	orig := nonInteractive
	t.Cleanup(func() { nonInteractive = orig })
	flagVal := true
	nonInteractive = &flagVal

	t.Setenv("TOKEN_JSON", `{"tokens":{"anilist":{"access_token":"tok123"}}}`)
	oauth, err := NewOAuth(testSiteConfig(), "http://localhost/callback", "anilist", nil, filepath.Join(t.TempDir(), "token.json"))
	if err != nil {
		t.Fatalf("NewOAuth() error = %v", err)
	}

	_, err = initOAuthIfNeeded(context.Background(), oauth, "18080", true)
	if err != nil {
		t.Errorf("expected no error with a loaded token, got: %v", err)
	}
}

// TestOAuth_LoadTokenFromConfig verifies that a pre-issued token from the
// site config (ANILIST_TOKEN / MAL_TOKEN / config.yaml token field) is used
// directly without any OAuth flow.
func TestOAuth_LoadTokenFromConfig(t *testing.T) {
	config := testSiteConfig()
	config.Token = "preissued_token_123"

	oauth, err := NewOAuth(config, "http://localhost/callback", "anilist", []oauth2.AuthCodeOption{}, filepath.Join(t.TempDir(), "token.json"))
	if err != nil {
		t.Fatalf("NewOAuth() error = %v", err)
	}

	if oauth.NeedInit() {
		t.Error("expected token to be loaded from config")
	}
	if !oauth.injected {
		t.Error("expected injected to be true for config token")
	}
	token, err := oauth.Token()
	if err != nil {
		t.Fatalf("Token() error = %v", err)
	}
	if token.AccessToken != "preissued_token_123" {
		t.Errorf("AccessToken = %q, want %q", token.AccessToken, "preissued_token_123")
	}
}

// TestValidateConfig_TokenMode verifies validation accepts pre-issued tokens
// in place of client IDs.
func TestValidateConfig_TokenMode(t *testing.T) {
	const (
		tok = "tok"
		cid = "cid"
	)

	base := Config{
		Anilist:     SiteConfig{Username: "ani_user"},
		MyAnimeList: SiteConfig{Username: "mal_user"},
	}

	t.Run("tokens only", func(t *testing.T) {
		cfg := base
		cfg.Anilist.Token = tok
		cfg.MyAnimeList.Token = tok
		err := validateConfig(cfg)
		if err != nil {
			t.Errorf("expected token-only config to validate, got: %v", err)
		}
	})

	t.Run("client ids only", func(t *testing.T) {
		cfg := base
		cfg.Anilist.ClientID = cid
		cfg.MyAnimeList.ClientID = cid
		err := validateConfig(cfg)
		if err != nil {
			t.Errorf("expected client-id config to validate, got: %v", err)
		}
	})

	t.Run("mixed", func(t *testing.T) {
		cfg := base
		cfg.Anilist.Token = tok        // AniList via token
		cfg.MyAnimeList.ClientID = cid // MAL via client ID
		err := validateConfig(cfg)
		if err != nil {
			t.Errorf("expected mixed config to validate, got: %v", err)
		}
	})

	t.Run("missing everything", func(t *testing.T) {
		err := validateConfig(base)
		if err == nil {
			t.Error("expected validation error when neither token nor client ID is set")
		}
	})

	t.Run("missing username", func(t *testing.T) {
		cfg := Config{
			Anilist:     SiteConfig{Token: "tok"},
			MyAnimeList: SiteConfig{Token: "tok", Username: "mal_user"},
		}
		err := validateConfig(cfg)
		if err == nil {
			t.Error("expected validation error when username is missing")
		}
	})
}

func TestWriteStatsFile(t *testing.T) {
	report := NewSyncReport()
	report.AddUnmappedItems([]UnmappedEntry{{Title: "X", MediaType: "anime"}})

	stats := NewStatistics()
	stats.TotalCount = 10
	stats.UpdatedCount = 2
	stats.SkippedCount = 7
	stats.ErrorCount = 1

	updater := &Updater{Prefix: "AniList to MAL Anime", Statistics: stats}

	path := filepath.Join(t.TempDir(), "stats.md")
	err := WriteStatsFile(path, []*Updater{updater}, report, 5*time.Second, false, nil)
	if err != nil {
		t.Fatalf("WriteStatsFile() error = %v", err)
	}

	content, err := os.ReadFile(path) //nolint:gosec // test reads a file written by WriteStatsFile above
	if err != nil {
		t.Fatalf("failed to read stats file: %v", err)
	}
	text := string(content)

	for _, want := range []string{
		"<!-- SYNC-STATS:START -->",
		"<!-- SYNC-STATS:END -->",
		"| Total entries | 10 |",
		"| Updated | 2 |",
		"| Skipped | 7 |",
		"| Errors | 1 |",
		"| Unmapped | 1 |",
		"AniList",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("stats file missing %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "FAILED") {
		t.Error("expected success block, got failure block")
	}
}

func TestWriteStatsFile_Failure(t *testing.T) {
	updater := &Updater{Statistics: NewStatistics()}
	path := filepath.Join(t.TempDir(), "stats.md")
	err := WriteStatsFile(path, []*Updater{updater}, NewSyncReport(), time.Second, false, errors.New("boom"))
	if err != nil {
		t.Fatalf("WriteStatsFile() error = %v", err)
	}

	content, err := os.ReadFile(path) //nolint:gosec // test reads a file written by WriteStatsFile above
	if err != nil {
		t.Fatalf("failed to read stats file: %v", err)
	}
	if !strings.Contains(string(content), "FAILED") {
		t.Errorf("expected failure block when runErr is set:\n%s", content)
	}
}

func TestWriteStatsFile_DryRunRow(t *testing.T) {
	stats := NewStatistics()
	stats.RecordDryRun(UpdateResult{Title: "A"})
	updater := &Updater{Statistics: stats}

	path := filepath.Join(t.TempDir(), "stats.md")
	err := WriteStatsFile(path, []*Updater{updater}, NewSyncReport(), time.Second, false, nil)
	if err != nil {
		t.Fatalf("WriteStatsFile() error = %v", err)
	}

	content, err := os.ReadFile(path) //nolint:gosec // test reads a file written by WriteStatsFile above
	if err != nil {
		t.Fatalf("failed to read stats file: %v", err)
	}
	if !strings.Contains(string(content), "| Dry run (would update) | 1 |") {
		t.Errorf("expected dry run row in stats file:\n%s", content)
	}
}
