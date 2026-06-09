## Summary

<!-- Brief description of what this PR does -->

## Changes

<!-- List the key changes -->
-
-

## Related Issues

<!-- Link related Linear or GitHub issues -->
<!-- Closes #NNN or Implements AZR-NNN -->

## Architecture Compliance

<!-- Check all that apply -->
- [ ] Follows PS.* namespace convention (D4)
- [ ] No ES modules or import/export
- [ ] All new files < 500 lines
- [ ] Uses `var` (not `let`/`const`)
- [ ] Errors hard crash via `PS.assert()` — no silent fails
- [ ] No external dependencies added (CDN, npm, libraries)
- [ ] Works from `file://` protocol
- [ ] **WebGPU changes:** WGSL shaders in `.wgsl.js` sidecar format (sets `window.SHADER_*_WGSL` global)
- [ ] **WebGPU changes:** WebGL2 fallback path untouched (or intentionally removed per AZR-849)
- [ ] **WebGPU changes:** No `fetch()` calls for shader/binary resources — sidecar pattern only
- [ ] **WASM changes:** `.wasm` binary base64-encoded into `.wasm.js` sidecar (sets `window.WASM_*_B64` global)
- [ ] **WASM changes:** Worker initialized via blob URL (not direct `new Worker('file.js')` — blocked on file://)
- [ ] **WASM changes:** `wasm-pack` build run and sidecar committed — no browser-time WASM compilation

## Validation

<!-- Describe how you verified this works -->
- [ ] `node --check` passes on all modified JS files
- [ ] `bash .codex/setup.sh` passes
- [ ] Browser smoke test completed
- [ ] Deterministic behavior verified (same seed → same result)

## Screenshots

<!-- If visual changes, attach before/after screenshots -->
