# Remote CDP (experimental)

This fork adds a remote-cdp browser host using an existing CloakBrowser/Chromium profile. The browser remains on its owner machine; Codex's tool broker and Responses proxy are intended to run on the Codex machine.

## Configuration

```sh
codex-chatgpt-web setup --browser-only --cdp-url 'http://cnode01:8080/api/profiles/aa4f7a10-bb4d-4d75-82d9-9ba4e55613a7/cdp' --acknowledge-unofficial
codex-chatgpt-web cdp doctor
```

**IMPORTANT: This is an unverified development branch, not an end-to-end RHEL 7.9 release.** Existing Linux service/tunnel management is macOS launchd-specific and must be completed before setup works on RHEL. No real CloakBrowser connection, account authorization, full MCP E2E, or RHEL native runtime has been tested. The `--full` mode also needs an approved OpenAI tunnel/connector/runtime key and remains subject to account permissions.

The CDP URL is resolved as a direct endpoint or a JSON endpoint returning a WebSocket URL. The default persistent browser context is reused; all tabs opened by this backend are owned by the worker and are not adopted from the existing profile. Reuse is keyed on the Codex conversation key. The backend does not launch local Chromium or Electron. This experimental implementation still needs Linux service supervision, robust crash-persistent browser leases, and verification of CloakBrowser's actual discovery response format.

Security: connect only over trusted/private CDP transport and do not publish browser control endpoints. Keep credentials out of logs. Temporary Chat, plugin configuration and model selection are still managed by upstream browser logic.

## Upstream maintenance

Keep `main` tracking upstream and this branch as an additive patch series. On an upstream release, update from `miuuyy/codex-chatgpt-web`, rebase this branch in a temporary worktree, run `bun run verify` and remote-cdp integration tests, and deploy only after full live E2E. Do not force-merge a conflicting Browser Host change.
