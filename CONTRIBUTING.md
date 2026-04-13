# Contributing to ai-gateway-lite

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/hyxnj666-creator/ai-gateway-lite.git
cd ai-gateway-lite
pnpm install
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm run typecheck` | TypeScript strict type check |
| `pnpm test` | Run all tests |
| `pnpm run test:watch` | Watch mode |
| `pnpm run build` | Build JS bundle + declarations |
| `pnpm run demo` | Start demo server (requires `.env`) |

## Workflow

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests for your changes
4. Run `pnpm run typecheck` and `pnpm test` — both must pass
5. Submit a pull request

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Write a clear title and description
- Reference any related issues
- All CI checks must pass before merge

## Adding a New Provider

1. Create `src/providers/your-provider.ts` implementing the `Provider` interface
2. Add the factory to `src/providers/registry.ts`
3. Add tests in `src/providers/__tests__/`
4. Add streaming support via `chatStream()` if the provider supports it
5. Update README with the new provider

## Reporting Issues

- Use the issue templates when available
- Include Node.js version, OS, and steps to reproduce
- For bugs, include the error message and stack trace

## Code Style

- TypeScript strict mode
- ESM imports (`.js` extensions in import paths)
- No runtime dependencies — use native `fetch` and Node.js APIs
- Tests with vitest

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
