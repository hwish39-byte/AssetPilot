# AssetPilot Foundry Compatibility Layer

This directory contains a project-maintained, minimal compatibility layer for the `forge-std/` imports used by AssetPilot's current tests and deployment scripts. It is not a vendored release of the full upstream `foundry-rs/forge-std` library.

## Included interfaces

| File | Purpose |
| --- | --- |
| `src/Vm.sol` | Foundry cheatcode declarations for environment access, broadcasting, caller impersonation, expected reverts, and expected events |
| `src/Test.sol` | The `vm` handle and the assertion overloads used by the contract tests |
| `src/Script.sol` | The `vm` handle used by deployment scripts |
| `src/console2.sol` | The logging overloads used by deployment scripts |

These Solidity files call Foundry's existing cheatcode and console addresses; they do not implement a separate VM or hold credentials. They use the repository's MIT license and Solidity 0.8.24 configuration.

## Reproducible setup

The four source files and this README are explicitly allowed by the root `.gitignore` and should be committed with the project. Their exact contents are versioned alongside the tests and scripts, so a normal clone needs no Git submodule initialization or `forge install` step.

After installing Foundry, run from the repository root:

```bash
forge build
forge test
```

Foundry may need network access to download Solidity 0.8.24 on first use. With that compiler already installed, `forge build --offline` and `forge test --offline` work without downloading Solidity dependencies.

The layer intentionally covers only the imports and methods currently used here. If new tests require additional upstream helpers, extend and test this layer or deliberately migrate to a pinned upstream revision. Do not assume the complete upstream API is available.
